from datetime import timedelta

from django.contrib.auth.decorators import login_required
from django.http import Http404
from django.shortcuts import get_object_or_404, redirect, render
from django.utils import timezone

from frontend.forms import CITY_CHOICES, INTEREST_CHOICES
from frontend.models import Profile, User

from . import services
from .models import Block, Like, Match, Notification, ProfileView, Report

# Every dashboard page needs a logged-in member with a profile.
# Visitors who aren't logged in are sent to the login page and brought back afterwards.

PROMPT_CHOICES = [
    "Two truths and a lie", "My ideal Sunday", "My love language", "Green flag I look for",
    "I'll fall for you if", "The way to my heart is", "My most Nigerian trait", "A perfect first date",
]
HEIGHT_CHOICES = ["4'10\"", "5'0\"", "5'2\"", "5'4\"", "5'6\"", "5'8\"", "5'10\"", "6'0\"", "6'2\"", "6'4\"", "6'6\""]


def member_required(view):
    """login_required + make sure the account has a dating profile (admins may not)."""
    @login_required
    def wrapper(request, *args, **kwargs):
        if not hasattr(request.user, "profile"):
            return render(request, "dashboard/no-profile.html", status=403)
        return view(request, *args, **kwargs)
    wrapper.__name__ = view.__name__
    return wrapper


def _today_start():
    return timezone.localtime().replace(hour=0, minute=0, second=0, microsecond=0)


def _match_summary(match, me):
    other = match.other(me)
    last = match.visible_messages(me).filter(is_deleted=False).last()
    return {
        **services.member_card(other, viewer=me),
        "match_id": match.pk,
        "new": not getattr(match, f"seen_{match.side(me)}"),
        "last": last.body[:80] if last else "",
        "matched": services.ago(match.created_at),
    }


@member_required
def discover(request):
    me = request.user
    matches = Match.for_user(me).order_by("-created_at")
    return render(request, "dashboard/discover.html", {
        "stats": services.live_stats(me),
        "page_data": {
            "me": {"img": me.avatar_url, "name": me.display_name},
            "stats": services.live_stats(me),
            "filters": {"min": me.profile.age_min, "max": me.profile.age_max,
                        "global": me.profile.global_mode, "city": me.profile.city},
            "miniMatches": [{"id": m.pk, "name": m.other(me).display_name, "img": m.other(me).avatar_url}
                            for m in matches[:8]],
        },
    })


@member_required
def matches(request):
    me = request.user
    my_matches = list(Match.for_user(me).order_by("-created_at"))
    matched_ids = {m.other(me).pk for m in my_matches}
    blocked = services.blocked_ids(me)

    liked_you = (Like.objects.filter(to_user=me, kind__in=["like", "super"])
                 .exclude(from_user_id__in=matched_ids | blocked)
                 .exclude(from_user__in=Like.objects.filter(from_user=me).values("to_user"))
                 .select_related("from_user").order_by("-created_at"))
    since = timezone.now() - timedelta(days=30)
    visitors = (ProfileView.objects.filter(viewed=me, viewed_at__gte=since).exclude(viewer_id__in=blocked)
                .select_related("viewer", "viewer__profile").order_by("-viewed_at")[:40])

    data = {
        "matches": [_match_summary(m, me) for m in my_matches],
        "liked": [{"img": l.from_user.avatar_url, "super": l.kind == "super"} for l in liked_you[:24]],
        "likedCount": liked_you.count(),
        "visitors": [{**services.member_card(v.viewer, viewer=me), "when": services.ago(v.viewed_at)}
                     for v in visitors if hasattr(v.viewer, "profile")],
        "tab": request.GET.get("tab", "matches"),
    }
    # Opening this page counts as having seen new matches.
    Match.objects.filter(user_a=me, seen_a=False).update(seen_a=True)
    Match.objects.filter(user_b=me, seen_b=False).update(seen_b=True)
    return render(request, "dashboard/matches.html", {"page_data": data})


@member_required
def messages_view(request):
    return render(request, "dashboard/messages.html", {
        "page_data": {"me": {"id": request.user.pk, "img": request.user.avatar_url}},
    })


@member_required
def profile(request):
    """Another member's profile: /profile/?id=5"""
    me = request.user
    try:
        member = User.objects.select_related("profile").get(pk=int(request.GET.get("id", "0")), is_active=True)
    except (User.DoesNotExist, ValueError):
        raise Http404
    if member.pk == me.pk:
        return redirect("my_profile")
    if not hasattr(member, "profile") or services.is_blocked(me, member):
        raise Http404
    match = Match.between(me, member)
    if not member.profile.is_visible and not match:
        raise Http404

    view, created = ProfileView.objects.get_or_create(viewer=me, viewed=member)
    if not created and timezone.now() - view.viewed_at > timedelta(hours=12):
        view.viewed_at = timezone.now()
        view.save(update_fields=["viewed_at"])
        created = True
    if created:
        services.notify(member, "view", f"{me.display_name} viewed your profile", actor=me, link=f"/profile/?id={me.pk}")

    mine = Like.objects.filter(from_user=me, to_user=member).first()
    return render(request, "dashboard/profile.html", {
        "member": member,
        "page_data": {
            **services.member_card(member, viewer=me, full=True),
            "matchId": match.pk if match else None,
            "myDecision": mine.kind if mine else None,
            "reasons": Report.REASONS,
        },
    })


@member_required
def my_profile(request):
    me = request.user
    p = me.profile
    return render(request, "dashboard/my-profile.html", {
        "p": p,
        "page_data": {
            "photos": [{"id": ph.pk, "url": ph.image.url} for ph in me.photos.all()],
            "interests": p.interests,
            "allInterests": INTEREST_CHOICES,
            "maxPhotos": 6,
        },
        "looking_choices": Profile.LOOKING_FOR_CHOICES,
        "height_choices": HEIGHT_CHOICES,
        "prompt_choices": PROMPT_CHOICES,
        "cities": CITY_CHOICES[1:],
        "stats": services.live_stats(me),
    })


@member_required
def settings_view(request):
    me = request.user
    blocks = Block.objects.filter(blocker=me).select_related("blocked").order_by("-created_at")
    return render(request, "dashboard/settings.html", {
        "p": me.profile,
        "show_me_choices": Profile.SHOW_ME_CHOICES,
        "cities": CITY_CHOICES[1:],
        "blocked": [{"id": b.blocked_id, "name": b.blocked.display_name, "img": b.blocked.avatar_url} for b in blocks],
    })


@member_required
def search(request):
    q = request.GET.get("q", "").strip()
    return render(request, "dashboard/search.html", {
        "q": q,
        "page_data": {"q": q, "results": services.search_members(request.user, q)},
    })


@member_required
def notifications(request):
    items = Notification.objects.filter(user=request.user).select_related("actor")[:100]
    today = _today_start()
    data = [{
        "id": n.pk,
        "t": n.kind,
        "txt": n.text,
        "img": n.actor.avatar_url if n.actor else None,
        "time": services.ago(n.created_at),
        "g": "Today" if n.created_at >= today else "Earlier",
        "unread": not n.is_read,
    } for n in items]
    return render(request, "dashboard/notifications.html", {"page_data": {"items": data}})


@member_required
def open_notification(request, pk):
    n = get_object_or_404(Notification, pk=pk, user=request.user)
    if not n.is_read:
        n.is_read = True
        n.save(update_fields=["is_read"])
    return redirect(n.link or "notifications")
