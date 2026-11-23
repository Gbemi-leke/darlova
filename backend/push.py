"""
Push notifications (Web Push) — alerts on the member's phone even when Darlova is closed.

Works on Android (Chrome, Edge, Samsung) and on iPhone/iPad (iOS 16.4+) when Darlova
has been added to the home screen. Needs VAPID keys in .env:
    python manage.py vapid_keys
"""
import json
import logging
import threading

from django.conf import settings
from django.templatetags.static import static
from django.utils import timezone

log = logging.getLogger(__name__)


def enabled():
    return bool(getattr(settings, "VAPID_PUBLIC_KEY", "") and getattr(settings, "VAPID_PRIVATE_KEY", ""))


def _send(subs, payload):
    from pywebpush import WebPushException, webpush

    from .models import PushSubscription

    data = json.dumps(payload)
    for sub in subs:
        try:
            webpush(
                subscription_info={"endpoint": sub.endpoint, "keys": {"p256dh": sub.p256dh, "auth": sub.auth}},
                data=data,
                vapid_private_key=settings.VAPID_PRIVATE_KEY,
                vapid_claims={"sub": settings.VAPID_SUBJECT},
                ttl=60 * 60 * 24,
                timeout=10,
            )
            PushSubscription.objects.filter(pk=sub.pk).update(last_used=timezone.now())
        except WebPushException as e:
            status = getattr(e.response, "status_code", None)
            if status in (404, 410):  # phone unsubscribed or app removed: forget it
                PushSubscription.objects.filter(pk=sub.pk).delete()
            else:
                log.warning("Push failed (%s) for %s: %s", status, sub.user_id, e)
        except Exception:  # never let a push problem break the request that triggered it
            log.exception("Push failed for %s", sub.user_id)


def send(users, title, body, url="/discover/", tag=None, badge_count=None):
    """Send a push to every device of `users` (a user, a list or a queryset). Runs in the background."""
    if not enabled():
        return
    from .models import PushSubscription

    if hasattr(users, "pk"):
        users = [users]
    subs = list(PushSubscription.objects.filter(user__in=users))
    if not subs:
        return
    payload = {
        "title": title,
        "body": body,
        "url": url or "/discover/",
        "tag": tag,
        "icon": static("images/app/icon-192.png"),
        "badge": static("images/app/icon-192.png"),
        "count": badge_count,
    }
    if getattr(settings, "PUSH_SYNC", False):  # tests
        _send(subs, payload)
    else:
        threading.Thread(target=_send, args=(subs, payload), daemon=True).start()
