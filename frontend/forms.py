import io
import uuid
from datetime import date

from django import forms
from django.conf import settings
from django.contrib.auth import get_user_model, password_validation
from django.core.files.base import ContentFile
from PIL import Image, ImageOps, UnidentifiedImageError

from .backends import normalize_phone
from .models import Profile

User = get_user_model()

CITY_CHOICES = [
    ("", "Choose…"),
    ("Lagos", "Lagos"),
    ("Abuja", "Abuja"),
    ("Ibadan", "Ibadan"),
    ("Port Harcourt", "Port Harcourt"),
    ("Abeokuta", "Abeokuta"),
    ("Enugu", "Enugu"),
    ("Kano", "Kano"),
]

INTEREST_CHOICES = [
    "Afrobeats", "Amapiano", "Travel", "Jollof", "Suya", "Football", "Basketball", "Fashion", "Movies",
    "Nollywood", "Church", "Mosque", "Gym", "Yoga", "Running", "Books", "Gaming", "Art", "Photography",
    "Hiking", "Cooking", "Tech", "Startups", "Dancing", "Karaoke", "Beach", "Coffee", "Tea", "Pets",
    "Plants", "Podcasts", "Comedy", "Anime", "Volunteering", "Road trips", "Wine", "Brunch", "Highlife",
]

# Which wizard step each field lives on, so the page can reopen the right step after an error.
FIELD_STEP = {
    "first_name": 1, "email": 1, "phone": 1, "password": 1, "terms": 1,
    "gender": 2, "show_me": 2, "date_of_birth": 2, "city": 2, "looking_for": 2,
    "interests": 3,
    "photos": 4,
}


# ---------------------------------------------------------------------------
# Login
# ---------------------------------------------------------------------------
class LoginForm(forms.Form):
    identifier = forms.CharField(label="Email or phone", max_length=254)
    password = forms.CharField(label="Password", widget=forms.PasswordInput)
    remember = forms.BooleanField(required=False, initial=True)


# ---------------------------------------------------------------------------
# Register (4-step wizard, submitted once at the end)
# ---------------------------------------------------------------------------
def process_photo(upload):
    """Check an uploaded photo and return it as a compressed JPEG (max 1080px)."""
    max_mb = getattr(settings, "MAX_PHOTO_UPLOAD_MB", 10)
    if upload.size > max_mb * 1024 * 1024:
        raise forms.ValidationError(f"Each photo must be under {max_mb} MB.")
    try:
        img = Image.open(upload)
        img = ImageOps.exif_transpose(img)  # fix rotation and drop location data
        img = img.convert("RGB")
    except (UnidentifiedImageError, OSError):
        raise forms.ValidationError("One of the files isn't a photo we can read. Please use JPG or PNG.")
    img.thumbnail((1080, 1440))
    buffer = io.BytesIO()
    img.save(buffer, format="JPEG", quality=82, optimize=True)
    return ContentFile(buffer.getvalue(), name=f"{uuid.uuid4().hex}.jpg")


class RegisterForm(forms.Form):
    # Step 1 — account
    first_name = forms.CharField(max_length=40)
    email = forms.EmailField()
    phone = forms.CharField(max_length=20, required=False)
    password = forms.CharField(widget=forms.PasswordInput)
    terms = forms.BooleanField(error_messages={"required": "Please confirm you are 18+ and accept the terms."})

    # Step 2 — about you
    gender = forms.ChoiceField(choices=Profile.GENDER_CHOICES, error_messages={"required": "Please choose how you identify."})
    show_me = forms.ChoiceField(choices=Profile.SHOW_ME_CHOICES, error_messages={"required": "Please choose who you want to see."})
    date_of_birth = forms.DateField(error_messages={"required": "Please enter your date of birth."})
    city = forms.ChoiceField(choices=CITY_CHOICES, error_messages={"required": "Please choose your city."})
    looking_for = forms.ChoiceField(choices=Profile.LOOKING_FOR_CHOICES, required=False)

    # Step 3 — interests (comma-separated, filled in by the page's script)
    interests = forms.CharField(required=False)

    def __init__(self, *args, files=None, **kwargs):
        super().__init__(*args, **kwargs)
        self.photo_files = files.getlist("photos") if files else []
        self.processed_photos = []

    def clean_first_name(self):
        return self.cleaned_data["first_name"].strip().title()

    def clean_email(self):
        email = self.cleaned_data["email"].strip().lower()
        if User.objects.filter(email__iexact=email).exists():
            raise forms.ValidationError("An account with this email already exists. Try logging in.")
        return email

    def clean_phone(self):
        raw = self.cleaned_data.get("phone", "")
        if not raw:
            return None
        phone = normalize_phone(raw)
        if len(phone) != 14:  # +234 followed by 10 digits
            raise forms.ValidationError("Please enter a valid Nigerian phone number.")
        if User.objects.filter(phone=phone).exists():
            raise forms.ValidationError("This phone number is already linked to an account.")
        return phone

    def clean_date_of_birth(self):
        dob = self.cleaned_data["date_of_birth"]
        today = date.today()
        age = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
        if age < 18:
            raise forms.ValidationError("You must be 18 or older to join Darlova.")
        if age > 100:
            raise forms.ValidationError("Please check your date of birth.")
        return dob

    def clean_interests(self):
        picked = [i.strip() for i in self.cleaned_data.get("interests", "").split(",") if i.strip()]
        picked = [i for i in dict.fromkeys(picked) if i in INTEREST_CHOICES]
        if len(picked) < 3:
            raise forms.ValidationError("Pick at least 3 interests.")
        return picked[:8]

    def clean(self):
        cleaned = super().clean()
        # Password rules (length, common passwords, too similar to name/email…)
        password = cleaned.get("password")
        if password:
            probe = User(email=cleaned.get("email", ""), first_name=cleaned.get("first_name", ""))
            try:
                password_validation.validate_password(password, probe)
            except forms.ValidationError as e:
                self.add_error("password", e)
        # Photos
        files = [f for f in self.photo_files if f]
        if len(files) < 2:
            self.add_error(None, forms.ValidationError("Please add at least 2 photos.", code="photos"))
        elif len(files) > 6:
            self.add_error(None, forms.ValidationError("You can add up to 6 photos.", code="photos"))
        else:
            try:
                self.processed_photos = [process_photo(f) for f in files]
            except forms.ValidationError as e:
                self.add_error(None, forms.ValidationError(e.messages[0], code="photos"))
        return cleaned

    @property
    def error_step(self):
        """The first wizard step that has an error (1–4)."""
        steps = [FIELD_STEP.get(name, 1) for name in self.errors if name != "__all__"]
        if any(e.code == "photos" for e in self.non_field_errors().as_data()):
            steps.append(4)
        return min(steps) if steps else 1

    def save(self):
        from .models import Photo, Profile  # local import keeps the module order simple

        data = self.cleaned_data
        user = User.objects.create_user(
            email=data["email"],
            password=data["password"],
            first_name=data["first_name"],
            phone=data["phone"],
        )
        Profile.objects.create(
            user=user,
            gender=data["gender"],
            show_me=data["show_me"],
            date_of_birth=data["date_of_birth"],
            city=data["city"],
            looking_for=data.get("looking_for") or "",
            interests=data["interests"],
        )
        for order, content in enumerate(self.processed_photos):
            photo = Photo(user=user, order=order)
            photo.image.save(content.name, content, save=True)
        return user
