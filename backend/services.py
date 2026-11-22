"""Shared dating logic used by the dashboard pages and the JSON API."""

from datetime import date, timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.db.models import Q
from django.templatetags.static import static
from django.utils import timezone

from .models import Block, Like, Match, Notification

User = get_user_model()


# ---------------------------------------------------------------------------
# Time / presence
# ---------------------------------------------------------------------------
def ago(dt):
    """'just now', '5m', '3h', 'Yesterday', '12 Nov'."""
    if not dt:
        return ""
    secs = (timezone.now() - dt).total_seconds()
    if secs < 60:
        return "just now"
    if secs < 3600:
        return f"{int(secs // 60)}m"
    if secs < 86400:
        return f"{int(secs // 3600)}h"
    if secs < 172800:
        return "Yesterday"
    return timezone.localtime(dt).strftime("%-d %b")


def ago_phrase(dt):
    """'just now', '5m ago', 'yesterday', 'on 12 Nov' — for use inside a sentence."""
    a = ago(dt)
    if a == "just now":
        return a
    if a == "Yesterday":
        return "yesterday"
    if a[-1] in "mh" and a[:-1].isdigit():
        return f"{a} ago"
    return f"on {a}"


def presence(user):
    """What other members see about someone's activity (respects 'Show online status')."""
    profile = getattr(user, "profile", None)
    if profile and not profile.show_online:
        return {"online": False, "status": ""}
    if user.is_online:
        return {"online": True, "status": "Online now"}
    if user.last_seen:
        return {"online": False, "status": f"Active {ago_phrase(user.last_seen)}"}
    return {"online": False, "status": ""}


# ---------------------------------------------------------------------------
# Serialising members for the page scripts
# ---------------------------------------------------------------------------
def photo_urls(user):
    urls = [p.image.url for p in user.photos.all()]
    return urls or [static("images/users/default-avatar.png")]


def compatibility(me, other):
    """A friendly 50–99% score from shared interests, intentions and city."""
    mp, op = getattr(me, "profile", None), getattr(other, "profile", None)
    if not mp or not op:
        return 60
    shared = len(set(mp.interests) & set(op.interests))
    score = 52 + shared * 8 + (10 if mp.looking_for and mp.looking_for == op.looking_for else 0) + (
        8 if mp.city == op.city else 0)
    return max(50, min(99, score))


def member_card(user, viewer=None, full=False):
    p = user.profile
    data = {
        "id": user.pk,
        "name": user.display_name,
        "age": p.age,
        "city": p.city,
        "job": p.job_title,
        "bio": p.bio,
        "interests": p.interests,
        "verified": p.is_verified,
        "photos": photo_urls(user),
        "looking": p.get_looking_for_display() if p.looking_for else "",
        **presence(user),
    }
    data["img"] = data["photos"][0]
    if viewer is not None and viewer.pk != user.pk:
        data["compat"] = compatibility(viewer, user)
        data["shared"] = sorted(set(viewer.profile.interests) & set(p.interests)) if hasattr(viewer, "profile") else []
    if full:
        data.update({
            "height": p.height,
            "education": p.education,
            "languages": p.languages,
            "prompts": p.prompts,
            "joined": user.date_joined.strftime("%B %Y"),
        })
    return data


# ---------------------------------------------------------------------------
# Who can see whom
# ---------------------------------------------------------------------------
def blocked_ids(user):
    """Members hidden from `user` because either side blocked the other."""
    ids = set(Block.objects.filter(blocker=user).values_list("blocked_id", flat=True))
    ids |= set(Block.objects.filter(blocked=user).values_list("blocker_id", flat=True))
    return ids


def is_blocked(u1, u2):
    return Block.objects.filter(Q(blocker=u1, blocked=u2) | Q(blocker=u2, blocked=u1)).exists()


def _years_ago(n):
    today = date.today()
    try:
        return today.replace(year=today.year - n)
    except ValueError:  # 29 February
        return today.replace(year=today.year - n, day=28)


def _gender_for(show_me):
    return {"women": ["woman"], "men": ["man"]}.get(show_me)


def discover_queryset(user, *, age_min=None, age_max=None, same_city=None, verified=False, online=False):
    """Members `user` hasn't decided on yet, who match both people's 'Show me' settings."""
    me = user.profile
    acted = Like.objects.filter(from_user=user).values_list("to_user_id", flat=True)
    qs = (User.objects.filter(is_active=True, profile__isnull=False, profile__is_visible=True, photos__isnull=False)
          .exclude(pk=user.pk).exclude(pk__in=acted).exclude(pk__in=blocked_ids(user))
          .distinct())

    genders = _gender_for(me.show_me)
    if genders:
        qs = qs.filter(profile__gender__in=genders)
    # ...and they must want to see someone like me
    qs = qs.filter(Q(profile__show_me="everyone") | Q(profile__show_me={"woman": "women", "man": "men"}.get(me.gender, "everyone")))

    age_min = age_min if age_min is not None else me.age_min
    age_max = age_max if age_max is not None else me.age_max
    # age >= age_min  <=>  born on/before today minus age_min years
    # age <= age_max  <=>  born after today minus (age_max + 1) years
    qs = qs.filter(profile__date_of_birth__lte=_years_ago(age_min),
                   profile__date_of_birth__gt=_years_ago(age_max + 1))

    if same_city if same_city is not None else not me.global_mode:
        qs = qs.filter(profile__city=me.city)
    if verified:
        qs = qs.filter(profile__is_verified=True)
    if online:
        window = timezone.now() - timedelta(seconds=getattr(settings, "ONLINE_WINDOW_SECONDS", 180))
        qs = qs.filter(last_seen__gte=window, profile__show_online=True)

    # Super-likers and people who already liked me first, then the most recently active.
    liked_me = Like.objects.filter(to_user=user, kind__in=[Like.LIKE, Like.SUPER]).values_list("from_user_id", flat=True)
    return qs.select_related("profile").prefetch_related("photos"), set(liked_me)


def _today_start():
    return timezone.localtime().replace(hour=0, minute=0, second=0, microsecond=0)


def live_stats(user):
    """Numbers on the dashboard that change as members act (polled by the page)."""
    from .models import ProfileView  # local import: avoid a cycle at module load

    today = _today_start()
    week = timezone.now() - timedelta(days=7)
    likes = [Like.LIKE, Like.SUPER]
    matches = Match.for_user(user)
    return {
        "likes_sent_today": Like.objects.filter(from_user=user, kind__in=likes, created_at__gte=today).count(),
        "likes_received_today": Like.objects.filter(to_user=user, kind__in=likes, created_at__gte=today).count(),
        "matches_today": matches.filter(created_at__gte=today).count(),
        "likes_left": likes_left_today(user),
        "views_7d": ProfileView.objects.filter(viewed=user, viewed_at__gte=week).count(),
        "likes_7d": Like.objects.filter(to_user=user, kind__in=likes, created_at__gte=week).count(),
        "matches_7d": matches.filter(created_at__gte=week).count(),
    }


def likes_left_today(user):
    start = _today_start()
    used = Like.objects.filter(from_user=user, kind__in=[Like.LIKE, Like.SUPER], created_at__gte=start).count()
    return max(0, getattr(settings, "DAILY_LIKE_LIMIT", 50) - used)


# ---------------------------------------------------------------------------
# Actions
# ---------------------------------------------------------------------------
def notify(user, kind, text, actor=None, link=""):
    prefs = getattr(user, "profile", None)
    if prefs:
        if kind == "match" and not prefs.notify_matches:
            return
        if kind in ("like", "super") and not prefs.notify_likes:
            return
        if kind == "msg" and not prefs.notify_messages:
            return
    if kind == "msg" and actor:
        # One "sent you a message" row per person, moved back to the top on each new message.
        n = Notification.objects.filter(user=user, actor=actor, kind="msg").first()
        if n:
            n.text, n.created_at, n.is_read = text, timezone.now(), False
            n.save(update_fields=["text", "created_at", "is_read"])
            return
    Notification.objects.create(user=user, actor=actor, kind=kind, text=text, link=link)


@transaction.atomic
def swipe(user, target, kind):
    """Record a like / super like / pass. Returns the Match if one was created."""
    if kind not in (Like.LIKE, Like.SUPER, Like.PASS):
        raise ValueError("Unknown action.")
    if target.pk == user.pk or is_blocked(user, target):
        raise ValueError("You can't do that.")
    if kind != Like.PASS and likes_left_today(user) <= 0:
        raise PermissionError("You're out of likes for today. They reset at midnight.")

    Like.objects.update_or_create(from_user=user, to_user=target, defaults={"kind": kind})
    if kind == Like.PASS:
        return None

    theirs = Like.objects.filter(from_user=target, to_user=user, kind__in=[Like.LIKE, Like.SUPER]).exists()
    if not theirs:
        notify(target, kind, f"Someone {'super ' if kind == Like.SUPER else ''}liked you{' ⭐' if kind == Like.SUPER else ''}",
               actor=None, link="/matches/?tab=liked")
        return None

    a, b = Match.pair(user, target)
    try:
        match, created = Match.objects.get_or_create(user_a=a, user_b=b)
    except IntegrityError:
        match, created = Match.objects.get(user_a=a, user_b=b), False
    if created:
        setattr(match, f"seen_{match.side(user)}", True)
        match.save(update_fields=["seen_a", "seen_b"])
        notify(target, "match", f"{user.display_name} matched with you. Say hi!", actor=user,
               link=f"/messages/?id={match.pk}")
    return match


def unmatch(user, match):
    other = match.other(user)
    match.delete()  # also deletes the conversation
    Like.objects.filter(from_user=user, to_user=other).update(kind=Like.PASS)


def block(user, target):
    Block.objects.get_or_create(blocker=user, blocked=target)
    m = Match.between(user, target)
    if m:
        m.delete()
    Like.objects.update_or_create(from_user=user, to_user=target, defaults={"kind": Like.PASS})
