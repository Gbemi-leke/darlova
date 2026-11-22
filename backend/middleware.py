from datetime import timedelta

from django.contrib.auth import get_user_model
from django.utils import timezone


class LastSeenMiddleware:
    """Stamps request.user.last_seen at most once a minute (one tiny UPDATE)."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        user = getattr(request, "user", None)
        if user is not None and user.is_authenticated:
            now = timezone.now()
            if not user.last_seen or now - user.last_seen > timedelta(seconds=60):
                get_user_model().objects.filter(pk=user.pk).update(last_seen=now)
                user.last_seen = now
        return self.get_response(request)
