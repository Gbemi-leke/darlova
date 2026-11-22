import json
import secrets
from datetime import timedelta

from django.conf import settings
from django.contrib import messages
from django.contrib.auth import authenticate, get_user_model, login, logout, password_validation
from django.contrib.auth.hashers import check_password, make_password
from django.core.exceptions import ValidationError
from django.core.mail import send_mail
from django.db.models import Count, F, Q
from django.http import JsonResponse
from django.shortcuts import redirect, render
from django.template.loader import render_to_string
from django.templatetags.static import static
from django.utils import timezone
from django.utils.http import url_has_allowed_host_and_scheme
from django.views.decorators.http import require_POST

from .forms import CITY_CHOICES, INTEREST_CHOICES, LoginForm, RegisterForm
from .models import PasswordResetCode, Profile

User = get_user_model()


# ---------------------------------------------------------------------------
# Public pages
# ---------------------------------------------------------------------------
def showcase_members(limit=18):
    """
    The most-liked members for the public pages (landing page, login).
    Ranked by likes in the last 30 days (a super like counts double), then all-time likes,
    then recent activity. Only visible members with a photo who allow "Show me on the homepage".
    Shows first name, age, city, job and photos — never contact details.
    """
    since = timezone.now() - timedelta(days=30)
    liked = Q(likes_received__kind__in=["like", "super"])
    qs = (User.objects.filter(is_active=True, profile__is_visible=True, profile__feature_on_home=True,
                              photos__isnull=False)
          .annotate(
              recent=Count("likes_received", filter=liked & Q(likes_received__created_at__gte=since), distinct=True),
              recent_super=Count("likes_received", filter=Q(likes_received__kind="super",
                                                            likes_received__created_at__gte=since), distinct=True),
              total=Count("likes_received", filter=liked, distinct=True))
          .annotate(score=F("recent") + F("recent_super"))
          .select_related("profile").prefetch_related("photos")
          .order_by("-score", "-total", F("last_seen").desc(nulls_last=True), "-date_joined")[:limit])
    people = []
    for u in qs:
        p = u.profile
        photos = [ph.image.url for ph in u.photos.all()][:4]
        people.append({
            "id": u.pk,
            "first": u.display_name,
            "name": f"{u.display_name}, {p.age}",
            "city": p.city,
            "job": " · ".join(x for x in (p.job_title, p.city) if x),
            "tags": p.interests[:3],
            "verified": p.is_verified,
            "img": photos[0],
            "photos": photos,
            "likes": u.total,
        })
    return people


def home(request):
    people = showcase_members()
    members = User.objects.filter(is_active=True, profile__isnull=False).count()
    window = timezone.now() - timedelta(seconds=getattr(settings, "ONLINE_WINDOW_SECONDS", 180))
    online = User.objects.filter(last_seen__gte=window, profile__show_online=True).count()
    return render(request, "frontend/index.html", {
        "showcase": people,
        "phone_person": people[1] if len(people) > 1 else (people[0] if people else None),
        "member_count": members,
        "online_count": online,
    })


def premium(request):
    return render(request, "frontend/premium.html")


def safety(request):
    return render(request, "frontend/safety.html")


def forgot_password(request):
    return render(request, "frontend/forgot-password.html")


def page_not_found(request, exception=None):
    return render(request, "frontend/404.html", status=404)


# ---------------------------------------------------------------------------
# Accounts
# ---------------------------------------------------------------------------
def _safe_next(request):
    nxt = request.POST.get("next") or request.GET.get("next") or ""
    if nxt and url_has_allowed_host_and_scheme(nxt, allowed_hosts={request.get_host()}, require_https=request.is_secure()):
        return nxt
    return None


def login_view(request):
    if request.user.is_authenticated:
        return redirect("discover")

    form = LoginForm(request.POST or None)
    error = None
    if request.method == "POST" and form.is_valid():
        user = authenticate(
            request,
            username=form.cleaned_data["identifier"],
            password=form.cleaned_data["password"],
        )
        if user is not None:
            login(request, user)
            if not form.cleaned_data.get("remember"):
                request.session.set_expiry(0)  # log out when the browser closes
            messages.success(request, f"Welcome back, {user.display_name}!")
            return redirect(_safe_next(request) or "discover")
        error = "That email/phone and password don't match. Please try again."

    return render(request, "frontend/login.html", {
        "side_photos": [m["img"] for m in showcase_members(limit=6)],
        "form": form,
        "error": error,
        "next": _safe_next(request) or "",
    })


def register_view(request):
    if request.user.is_authenticated:
        return redirect("discover")

    if request.method == "POST":
        form = RegisterForm(request.POST, files=request.FILES)
        if form.is_valid():
            user = form.save()
            login(request, user, backend="frontend.backends.EmailOrPhoneBackend")
            messages.success(request, f"You're in, {user.display_name}! Welcome to Darlova.")
            return redirect("discover")
    else:
        form = RegisterForm()

    return render(request, "frontend/register.html", {
        "form": form,
        "cities": CITY_CHOICES[1:],
        "looking_choices": Profile.LOOKING_FOR_CHOICES,
        "interest_choices": INTEREST_CHOICES,
        "error_step": form.error_step if form.is_bound else 1,
    })


@require_POST
def logout_view(request):
    logout(request)
    messages.info(request, "You've been logged out. See you soon!")
    return redirect("home")


# ---------------------------------------------------------------------------
# Forgot password: email a 6-digit code → verify it → choose a new password
# ---------------------------------------------------------------------------
def _json(request):
    try:
        return json.loads(request.body or b"{}")
    except json.JSONDecodeError:
        return {}


def _err(msg, status=400):
    return JsonResponse({"error": msg}, status=status)


@require_POST
def reset_request(request):
    email = str(_json(request).get("email", "")).strip().lower()
    if "@" not in email:
        return _err("Enter the email you signed up with.")
    user = User.objects.filter(email__iexact=email, is_active=True).first()
    if user:
        last = user.reset_codes.order_by("-created_at").first()
        if last and timezone.now() - last.created_at < timedelta(seconds=30):
            return _err("Please wait 30 seconds before asking for another code.", 429)
        user.reset_codes.filter(used=False).update(used=True)  # only the newest code works
        code = f"{secrets.randbelow(10**6):06d}"
        PasswordResetCode.objects.create(user=user, code_hash=make_password(code))
        ctx = {"name": user.display_name, "code": code, "minutes": 15,
               "logo": request.build_absolute_uri(static("images/brand/logo-icon.png"))}
        send_mail(
            subject=f"{code} is your Darlova reset code",
            message=render_to_string("emails/reset_code.txt", ctx),
            html_message=render_to_string("emails/reset_code.html", ctx),
            from_email=None,
            recipient_list=[user.email],
            fail_silently=False,
        )
    # Same answer whether or not the email exists, so nobody can fish for accounts.
    request.session["reset_email"] = email
    request.session.pop("reset_ok_user", None)
    return JsonResponse({"ok": True})


@require_POST
def reset_verify(request):
    email = request.session.get("reset_email")
    code = "".join(ch for ch in str(_json(request).get("code", "")) if ch.isdigit())
    if not email:
        return _err("Start again: enter your email first.")
    user = User.objects.filter(email__iexact=email, is_active=True).first()
    rc = user.reset_codes.filter(used=False).order_by("-created_at").first() if user else None
    if not rc or not rc.is_valid:
        return _err("That code has expired. Ask for a new one.")
    rc.attempts += 1
    rc.save(update_fields=["attempts"])
    if len(code) != 6 or not check_password(code, rc.code_hash):
        left = PasswordResetCode.MAX_ATTEMPTS - rc.attempts
        return _err(f"That code isn't right. {left} {'try' if left == 1 else 'tries'} left." if left > 0
                    else "Too many wrong tries. Ask for a new code.")
    request.session["reset_ok_user"] = user.pk
    request.session["reset_ok_code"] = rc.pk
    request.session["reset_ok_at"] = timezone.now().isoformat()
    return JsonResponse({"ok": True})


@require_POST
def reset_password(request):
    uid, rc_id, at = (request.session.get(k) for k in ("reset_ok_user", "reset_ok_code", "reset_ok_at"))
    if not uid or not at or timezone.now() - timezone.datetime.fromisoformat(at) > timedelta(minutes=15):
        return _err("Your reset session expired. Start again.")
    user = User.objects.filter(pk=uid, is_active=True).first()
    rc = PasswordResetCode.objects.filter(pk=rc_id, user_id=uid, used=False).first()
    if not user or not rc:
        return _err("Your reset session expired. Start again.")
    password = str(_json(request).get("password", ""))
    try:
        password_validation.validate_password(password, user)
    except ValidationError as e:
        return _err(" ".join(e.messages))
    user.set_password(password)
    user.save(update_fields=["password"])  # also logs out every other device
    user.reset_codes.update(used=True)
    for k in ("reset_email", "reset_ok_user", "reset_ok_code", "reset_ok_at"):
        request.session.pop(k, None)
    return JsonResponse({"ok": True})
