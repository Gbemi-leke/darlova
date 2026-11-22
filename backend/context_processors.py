from django.db.models import Q

from .models import Match, Message, Notification, Report


def unread_counts(user):
    matches = Match.for_user(user)
    new_matches = matches.filter(Q(user_a=user, seen_a=False) | Q(user_b=user, seen_b=False)).count()
    unread_msgs = Message.objects.filter(match__in=matches, read_at__isnull=True, is_deleted=False).exclude(
        sender=user).count()
    unread_notifs = Notification.objects.filter(user=user, is_read=False).count()
    return {"new_matches": new_matches, "unread_messages": unread_msgs, "unread_notifications": unread_notifs}


def dashboard_counts(request):
    """Badge numbers for the sidebar / bottom menu / bell on every dashboard page."""
    user = getattr(request, "user", None)
    if not user or not user.is_authenticated or not request.path.startswith(
            ("/discover", "/matches", "/messages", "/profile", "/my-profile", "/settings", "/notifications")):
        return {}
    return {"counts": unread_counts(user), "report_reasons": Report.REASONS}
