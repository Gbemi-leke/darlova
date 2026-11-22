import re

from django.contrib.auth import get_user_model
from django.contrib.auth.backends import ModelBackend
from django.db.models import Q


def normalize_phone(value):
    """Turn 0801 234 5678, +234 801 234 5678 or 2348012345678 into +2348012345678."""
    digits = re.sub(r"\D", "", value or "")
    if not digits:
        return ""
    if digits.startswith("234"):
        return "+" + digits
    if digits.startswith("0"):
        return "+234" + digits[1:]
    return "+234" + digits


class EmailOrPhoneBackend(ModelBackend):
    """Log in with either an email address or a phone number."""

    def authenticate(self, request, username=None, password=None, **kwargs):
        identifier = (username or kwargs.get("email") or "").strip()
        if not identifier or not password:
            return None
        User = get_user_model()
        query = Q(email__iexact=identifier)
        phone = normalize_phone(identifier) if "@" not in identifier else ""
        if phone:
            query |= Q(phone=phone)
        user = User.objects.filter(query).first()
        if user is None:
            User().set_password(password)  # same timing as a real check
            return None
        if user.check_password(password) and self.user_can_authenticate(user):
            return user
        return None
