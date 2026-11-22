from datetime import date, timedelta

from django.conf import settings
from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.db import models
from django.templatetags.static import static
from django.utils import timezone


class UserManager(BaseUserManager):
    """Users are identified by email instead of a username."""

    use_in_migrations = True

    def _create_user(self, email, password, **extra_fields):
        if not email:
            raise ValueError("An email address is required.")
        email = self.normalize_email(email).lower()
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", False)
        extra_fields.setdefault("is_superuser", False)
        return self._create_user(email, password, **extra_fields)

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        if extra_fields.get("is_staff") is not True or extra_fields.get("is_superuser") is not True:
            raise ValueError("A superuser needs is_staff=True and is_superuser=True.")
        return self._create_user(email, password, **extra_fields)


class User(AbstractUser):
    """A Darlova account. Log in with email (or phone, see backends.py)."""

    username = None
    email = models.EmailField("email address", unique=True)
    phone = models.CharField(max_length=20, unique=True, null=True, blank=True)
    last_seen = models.DateTimeField(null=True, blank=True, db_index=True)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["first_name"]

    objects = UserManager()

    def __str__(self):
        return self.email

    @property
    def display_name(self):
        return self.first_name or self.email.split("@")[0]

    @property
    def avatar_url(self):
        """Main photo if the member has one, otherwise the default avatar."""
        photo = self.photos.order_by("order").first()
        return photo.image.url if photo else static("images/users/default-avatar.png")

    @property
    def is_online(self):
        if not self.last_seen:
            return False
        window = getattr(settings, "ONLINE_WINDOW_SECONDS", 180)
        return timezone.now() - self.last_seen < timedelta(seconds=window)


class Profile(models.Model):
    """Dating details collected during sign-up and edited on My profile."""

    GENDER_CHOICES = [("woman", "Woman"), ("man", "Man"), ("other", "Other")]
    SHOW_ME_CHOICES = [("women", "Women"), ("men", "Men"), ("everyone", "Everyone")]
    LOOKING_FOR_CHOICES = [
        ("long-term", "Long-term relationship"),
        ("marriage", "Marriage"),
        ("casual", "Something casual"),
        ("friends", "New friends"),
        ("not-sure", "Not sure yet"),
    ]

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="profile")
    gender = models.CharField(max_length=10, choices=GENDER_CHOICES)
    show_me = models.CharField(max_length=10, choices=SHOW_ME_CHOICES)
    date_of_birth = models.DateField()
    city = models.CharField(max_length=60)
    looking_for = models.CharField(max_length=20, choices=LOOKING_FOR_CHOICES, blank=True)
    interests = models.JSONField(default=list, blank=True)
    bio = models.TextField(max_length=300, blank=True)
    job_title = models.CharField(max_length=80, blank=True)
    height = models.CharField(max_length=10, blank=True)
    education = models.CharField(max_length=100, blank=True)
    languages = models.CharField(max_length=100, blank=True)
    prompt1_q = models.CharField("prompt 1", max_length=60, blank=True)
    prompt1_a = models.CharField("answer 1", max_length=200, blank=True)
    prompt2_q = models.CharField("prompt 2", max_length=60, blank=True)
    prompt2_a = models.CharField("answer 2", max_length=200, blank=True)
    is_verified = models.BooleanField(default=False)

    # Discovery settings
    is_visible = models.BooleanField("show me on Darlova", default=True)
    global_mode = models.BooleanField("see people outside my city", default=True)
    age_min = models.PositiveSmallIntegerField(default=18)
    age_max = models.PositiveSmallIntegerField(default=60)
    feature_on_home = models.BooleanField("show me on the homepage", default=True)

    # Privacy and notification settings
    show_online = models.BooleanField(default=True)
    read_receipts = models.BooleanField(default=True)
    notify_matches = models.BooleanField(default=True)
    notify_messages = models.BooleanField(default=True)
    notify_likes = models.BooleanField(default=True)
    email_updates = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.user.display_name} ({self.city})"

    @property
    def age(self):
        today = date.today()
        dob = self.date_of_birth
        return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))

    @property
    def prompts(self):
        return [(q, a) for q, a in ((self.prompt1_q, self.prompt1_a), (self.prompt2_q, self.prompt2_a)) if q and a]

    def shows(self, gender):
        """Does this member want to see people of `gender`?"""
        return self.show_me == "everyone" or (self.show_me == "women" and gender == "woman") or (
            self.show_me == "men" and gender == "man")


def photo_upload_path(instance, filename):
    return f"photos/{instance.user_id}/{filename}"


class Photo(models.Model):
    """A member photo. order=0 is the main photo."""

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="photos")
    image = models.ImageField(upload_to=photo_upload_path)
    order = models.PositiveSmallIntegerField(default=0)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["order", "uploaded_at"]

    def __str__(self):
        return f"Photo {self.order} of {self.user}"


class PasswordResetCode(models.Model):
    """A 6-digit code emailed to reset a password. Only a hash of the code is stored."""

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="reset_codes")
    code_hash = models.CharField(max_length=128)
    attempts = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    used = models.BooleanField(default=False)

    LIFETIME = timedelta(minutes=15)
    MAX_ATTEMPTS = 5

    @property
    def is_valid(self):
        return not self.used and self.attempts < self.MAX_ATTEMPTS and timezone.now() - self.created_at < self.LIFETIME
