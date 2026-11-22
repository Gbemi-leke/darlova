"""JSON endpoints used by the dashboard page scripts (all need a logged-in member)."""

import json
from datetime import timedelta
from functools import wraps

from django.contrib.auth import logout, password_validation, update_session_auth_hash
from django.contrib.sessions.models import Session
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db import transaction
from django.db.models import Max, Q
from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.views.decorators.http import require_GET, require_POST

from frontend.backends import normalize_phone
from frontend.forms import CITY_CHOICES, INTEREST_CHOICES, process_photo
from frontend.models import Photo, Profile, User

from . import services
from .context_processors import unread_counts
from .models import Block, Match, Message, Notification, Report
from .views import HEIGHT_CHOICES, PROMPT_CHOICES

MAX_PHOTOS = 6


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def api(view):
    """Logged-in members only; turns errors into {"error": "..."} JSON."""
    @wraps(view)
    def wrapper(request, *args, **kwargs):
        if not request.user.is_authenticated:
            return JsonResponse({"error": "Please log in again."}, status=401)
        if not hasattr(request.user, "profile"):
            return JsonResponse({"error": "This account has no dating profile."}, status=403)
        try:
            return view(request, *args, **kwargs)
        except ValidationError as e:
            return JsonResponse({"error": " ".join(e.messages)}, status=400)
        except PermissionError as e:
            return JsonResponse({"error": str(e)}, status=403)
        except ValueError as e:
            return JsonResponse({"error": str(e) or "Something went wrong."}, status=400)
    return wrapper


def body(request):
    """Accepts JSON bodies and normal form posts."""
    if request.content_type == "application/json":
        try:
            return json.loads(request.body or b"{}")
        except json.JSONDecodeError:
            raise ValueError("Invalid request.")
    return request.POST


def ok(**data):
    return JsonResponse({"ok": True, **data})


def get_member(pk):
    try:
        return User.objects.select_related("profile").get(pk=int(pk), is_active=True, profile__isnull=False)
    except (User.DoesNotExist, ValueError, TypeError):
        raise ValueError("That member isn't available.")


def as_bool(v):
    return v in (True, "true", "1", "on", 1)


# ---------------------------------------------------------------------------
# Badges / heartbeat
# ---------------------------------------------------------------------------
@require_GET
@api
def pulse(request):
    """Polled every ~15s on dashboard pages: keeps you 'online', refreshes badges and live stats."""
    return ok(**unread_counts(request.user), stats=services.live_stats(request.user))


@require_POST
@api
def notifications_read(request):
    Notification.objects.filter(user=request.user, is_read=False).update(is_read=True)
    return ok(**unread_counts(request.user))


# ---------------------------------------------------------------------------
# Discover
# ---------------------------------------------------------------------------
@require_GET
@api
def discover(request):
    g = request.GET
    age_min = max(18, min(int(g.get("min") or request.user.profile.age_min), 99))
    age_max = max(age_min, min(int(g.get("max") or request.user.profile.age_max), 99))
    same_city = None if g.get("global") is None else not as_bool(g.get("global"))
    qs, liked_me = services.discover_queryset(
        request.user, age_min=age_min, age_max=age_max, same_city=same_city,
        verified=as_bool(g.get("verified")), online=as_bool(g.get("online")))
    people = list(qs.order_by("-last_seen")[:60])
    people.sort(key=lambda u: (u.pk not in liked_me,))  # people who liked you first
    return ok(people=[services.member_card(u, viewer=request.user) for u in people[:30]],
              likesLeft=services.likes_left_today(request.user))


@require_POST
@api
def swipe(request):
    data = body(request)
    target = get_member(data.get("user_id"))
    match = services.swipe(request.user, target, data.get("action"))
    resp = {"likesLeft": services.likes_left_today(request.user), "match": None,
            "stats": services.live_stats(request.user)}
    if match:
        resp["match"] = {"id": match.pk, "name": target.display_name, "img": target.avatar_url,
                         "interests": target.profile.interests[:3]}
    return ok(**resp)


@require_POST
@api
def save_filters(request):
    data = body(request)
    p = request.user.profile
    p.age_min = max(18, min(int(data.get("min", p.age_min)), 99))
    p.age_max = max(p.age_min, min(int(data.get("max", p.age_max)), 99))
    if "global" in data:
        p.global_mode = as_bool(data.get("global"))
    p.save(update_fields=["age_min", "age_max", "global_mode"])
    return ok()


# ---------------------------------------------------------------------------
# Matches, blocking, reporting
# ---------------------------------------------------------------------------
@require_POST
@api
def unmatch(request):
    match = get_object_or_404(Match.for_user(request.user), pk=body(request).get("match_id"))
    services.unmatch(request.user, match)
    return ok()


@require_POST
@api
def block(request):
    services.block(request.user, get_member(body(request).get("user_id")))
    return ok()


@require_POST
@api
def unblock(request):
    Block.objects.filter(blocker=request.user, blocked_id=body(request).get("user_id")).delete()
    return ok()


@require_POST
@api
def report(request):
    data = body(request)
    target = get_member(data.get("user_id"))
    reason = data.get("reason")
    if reason not in dict(Report.REASONS):
        raise ValueError("Please choose a reason.")
    Report.objects.create(reporter=request.user, reported=target, reason=reason,
                          details=str(data.get("details", ""))[:1000])
    if as_bool(data.get("block")):
        services.block(request.user, target)
    return ok()


# ---------------------------------------------------------------------------
# Chat
# ---------------------------------------------------------------------------
def _msg(m, me, read_receipts_ok):
    mine = m.sender_id == me.pk
    reply = None
    if m.reply_to_id and m.reply_to:
        reply = {"id": m.reply_to_id, "mine": m.reply_to.sender_id == me.pk,
                 "body": "Message unsent" if m.reply_to.is_deleted else m.reply_to.body[:120]}
    return {
        "id": m.pk,
        "mine": mine,
        "body": "" if m.is_deleted else m.body,
        "deleted": m.is_deleted,
        "reply": reply,
        "reaction": m.reaction,
        "at": m.created_at.isoformat(),
        "read": bool(m.read_at) and mine and read_receipts_ok,
    }


def _conversation(match, me):
    other = match.other(me)
    msgs = match.visible_messages(me)
    last = msgs.last()
    unread = msgs.filter(read_at__isnull=True, is_deleted=False).exclude(sender=me).count()
    if last:
        preview = ("You: " if last.sender_id == me.pk else "") + ("Message unsent" if last.is_deleted else last.body)
    else:
        preview = ""
    return {
        "id": match.pk,
        "user": {"id": other.pk, "name": other.display_name, "age": other.profile.age, "img": other.avatar_url,
                 "interests": other.profile.interests[:3], **services.presence(other)},
        "last": preview[:90],
        "lastAt": (last.created_at if last else match.created_at).isoformat(),
        "unread": unread,
        "typing": match.is_typing(other),
        "new": not getattr(match, f"seen_{match.side(me)}"),
    }


@require_GET
@api
def chats(request):
    me = request.user
    matches = (Match.for_user(me).select_related("user_a__profile", "user_b__profile")
               .prefetch_related("user_a__photos", "user_b__photos"))
    convs = [_conversation(m, me) for m in matches]
    convs.sort(key=lambda c: c["lastAt"], reverse=True)
    return ok(chats=convs)


def _my_match(request, match_id):
    match = get_object_or_404(Match.objects.select_related("user_a__profile", "user_b__profile"), pk=match_id)
    if not match.has(request.user):
        raise ValueError("That conversation isn't available.")
    return match


@require_GET
@api
def chat_messages(request, match_id):
    """New messages since ?after=<id>, plus read receipts, typing and online status."""
    me = request.user
    match = _my_match(request, match_id)
    other = match.other(me)

    # Opening a chat marks their messages as read (and the match as seen).
    now = timezone.now()
    match.messages.filter(read_at__isnull=True).exclude(sender=me).update(read_at=now)
    side = match.side(me)
    if not getattr(match, f"seen_{side}"):
        setattr(match, f"seen_{side}", True)
        match.save(update_fields=[f"seen_{side}"])
    Notification.objects.filter(user=me, actor=other, kind__in=["msg", "match"], is_read=False).update(is_read=True)

    msgs = match.visible_messages(me).select_related("reply_to")
    after = request.GET.get("after")
    full = not after
    if not full:
        msgs = msgs.filter(pk__gt=int(after))
    msgs = list(msgs.order_by("-id")[:200])[::-1]

    receipts_ok = other.profile.read_receipts and me.profile.read_receipts
    mine_read = match.messages.filter(sender=me, read_at__isnull=False).aggregate(m=Max("id"))["m"] if receipts_ok else None

    # Reactions / unsends on older messages: send the recent window so the page can refresh them.
    changed = []
    if not full:
        recent = match.visible_messages(me).filter(Q(is_deleted=True) | ~Q(reaction="")).order_by("-id")[:50]
        changed = [{"id": m.pk, "reaction": m.reaction, "deleted": m.is_deleted} for m in recent]

    return ok(
        messages=[_msg(m, me, receipts_ok) for m in msgs],
        readUpTo=mine_read,
        typing=match.is_typing(other),
        user={"id": other.pk, "name": other.display_name, "age": other.profile.age, "img": other.avatar_url,
              "interests": other.profile.interests[:3], "matched": services.ago_phrase(match.created_at),
              **services.presence(other)},
        changed=changed,
    )


@require_POST
@api
def chat_send(request, match_id):
    me = request.user
    match = _my_match(request, match_id)
    other = match.other(me)
    if services.is_blocked(me, other):
        raise PermissionError("You can't message this member.")
    data = body(request)
    text = str(data.get("body", "")).strip()
    if not text:
        raise ValueError("Type a message first.")
    if len(text) > 2000:
        raise ValueError("Messages can be up to 2,000 characters.")
    reply_to = None
    if data.get("reply_to"):
        reply_to = match.messages.filter(pk=data.get("reply_to")).first()

    with transaction.atomic():
        msg = Message.objects.create(match=match, sender=me, body=text, reply_to=reply_to)
        side = match.side(me)
        setattr(match, f"typing_{side}_until", None)
        match.last_message_at = msg.created_at
        match.save(update_fields=[f"typing_{side}_until", "last_message_at"])
    services.notify(other, "msg", f"{me.display_name} sent you a message", actor=me, link=f"/messages/?id={match.pk}")
    return ok(message=_msg(msg, me, False))


@require_POST
@api
def chat_typing(request, match_id):
    match = _my_match(request, match_id)
    side = match.side(request.user)
    until = timezone.now() + timedelta(seconds=5) if as_bool(body(request).get("typing", True)) else None
    Match.objects.filter(pk=match.pk).update(**{f"typing_{side}_until": until})
    return ok()


@require_POST
@api
def chat_clear(request, match_id):
    match = _my_match(request, match_id)
    Match.objects.filter(pk=match.pk).update(**{f"cleared_{match.side(request.user)}_at": timezone.now()})
    return ok()


@require_POST
@api
def message_react(request, msg_id):
    msg = get_object_or_404(Message.objects.select_related("match"), pk=msg_id)
    if not msg.match.has(request.user) or msg.sender_id == request.user.pk or msg.is_deleted:
        raise ValueError("You can only react to messages you received.")
    emoji = str(body(request).get("emoji", "❤️"))[:8]
    msg.reaction = "" if msg.reaction == emoji else emoji
    msg.save(update_fields=["reaction"])
    return ok(reaction=msg.reaction)


@require_POST
@api
def message_unsend(request, msg_id):
    msg = get_object_or_404(Message, pk=msg_id, sender=request.user)
    msg.is_deleted, msg.body, msg.reaction = True, "", ""
    msg.save(update_fields=["is_deleted", "body", "reaction"])
    return ok()


# ---------------------------------------------------------------------------
# My profile
# ---------------------------------------------------------------------------
def _photos(user):
    return [{"id": p.pk, "url": p.image.url} for p in user.photos.all()]


def _reorder(user, first_id=None):
    photos = list(user.photos.all())
    if first_id:
        photos.sort(key=lambda p: p.pk != first_id)
    for i, p in enumerate(photos):
        if p.order != i:
            p.order = i
            p.save(update_fields=["order"])


@require_POST
@api
def profile_save(request):
    me = request.user
    p = me.profile
    d = body(request)

    name = str(d.get("first_name", me.first_name)).strip()
    if not name:
        raise ValueError("Please add your first name.")
    interests = d.get("interests", p.interests)
    if isinstance(interests, str):
        interests = [i for i in interests.split(",") if i]
    interests = [i for i in interests if i in INTEREST_CHOICES]
    if not 3 <= len(interests) <= 8:
        raise ValueError("Pick between 3 and 8 interests.")
    looking = d.get("looking_for", p.looking_for)
    if looking and looking not in dict(Profile.LOOKING_FOR_CHOICES):
        raise ValueError("Choose what you're looking for.")
    height = d.get("height", p.height)
    if height and height not in HEIGHT_CHOICES:
        raise ValueError("Choose a height from the list.")
    city = d.get("city", p.city)
    if city not in dict(CITY_CHOICES[1:]):
        raise ValueError("Choose a city from the list.")

    def prompt(key):
        v = str(d.get(key, getattr(p, key))).strip()
        if key.endswith("_q") and v and v not in PROMPT_CHOICES:
            raise ValueError("Choose a prompt from the list.")
        return v

    me.first_name = name[:40]
    me.save(update_fields=["first_name"])
    p.job_title = str(d.get("job_title", p.job_title)).strip()[:80]
    p.bio = str(d.get("bio", p.bio)).strip()[:300]
    p.looking_for = looking
    p.height = height
    p.education = str(d.get("education", p.education)).strip()[:100]
    p.languages = str(d.get("languages", p.languages)).strip()[:100]
    p.city = city
    p.interests = interests
    p.prompt1_q, p.prompt1_a = prompt("prompt1_q"), prompt("prompt1_a")[:200]
    p.prompt2_q, p.prompt2_a = prompt("prompt2_q"), prompt("prompt2_a")[:200]
    p.save()
    return ok(name=me.display_name)


@require_POST
@api
def photo_upload(request):
    me = request.user
    if me.photos.count() >= MAX_PHOTOS:
        raise ValueError(f"You can have up to {MAX_PHOTOS} photos. Remove one first.")
    upload = request.FILES.get("photo")
    if not upload:
        raise ValueError("Choose a photo to upload.")
    try:
        image = process_photo(upload)
    except Exception as e:  # forms.ValidationError from process_photo
        raise ValueError(" ".join(getattr(e, "messages", [str(e)])))
    photo = Photo(user=me, order=me.photos.count())
    photo.image.save(image.name, image, save=True)
    return ok(photos=_photos(me))


@require_POST
@api
def photo_delete(request, photo_id):
    me = request.user
    photo = get_object_or_404(Photo, pk=photo_id, user=me)
    if me.photos.count() <= 1:
        raise ValueError("Keep at least one photo so people can see you.")
    photo.image.delete(save=False)
    photo.delete()
    _reorder(me)
    return ok(photos=_photos(me))


@require_POST
@api
def photo_main(request, photo_id):
    me = request.user
    get_object_or_404(Photo, pk=photo_id, user=me)
    _reorder(me, first_id=int(photo_id))
    return ok(photos=_photos(me))


# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------
PREF_FIELDS = {"is_visible", "show_online", "read_receipts", "notify_matches", "notify_messages",
               "notify_likes", "email_updates", "global_mode", "feature_on_home"}


@require_POST
@api
def settings_account(request):
    me = request.user
    d = body(request)
    email = str(d.get("email", "")).strip().lower()
    validate_email(email)
    if User.objects.filter(email__iexact=email).exclude(pk=me.pk).exists():
        raise ValueError("Another account already uses that email.")
    phone_raw = str(d.get("phone", "")).strip()
    phone = normalize_phone(phone_raw) if phone_raw else None
    if phone_raw and len(phone) != 14:
        raise ValueError("Enter a valid Nigerian phone number, e.g. 0801 234 5678.")
    if phone and User.objects.filter(phone=phone).exclude(pk=me.pk).exists():
        raise ValueError("Another account already uses that phone number.")
    city = d.get("city", me.profile.city)
    if city not in dict(CITY_CHOICES[1:]):
        raise ValueError("Choose a city from the list.")
    me.email, me.phone = email, phone
    me.save(update_fields=["email", "phone"])
    me.profile.city = city
    me.profile.save(update_fields=["city"])
    return ok()


@require_POST
@api
def settings_prefs(request):
    d = body(request)
    p = request.user.profile
    changed = []
    for key, value in d.items():
        if key in PREF_FIELDS:
            setattr(p, key, as_bool(value))
            changed.append(key)
    if "age_min" in d or "age_max" in d:
        p.age_min = max(18, min(int(d.get("age_min", p.age_min)), 99))
        p.age_max = max(p.age_min, min(int(d.get("age_max", p.age_max)), 99))
        changed += ["age_min", "age_max"]
    if not changed:
        raise ValueError("Nothing to save.")
    p.save(update_fields=changed)
    return ok()


@require_POST
@api
def settings_password(request):
    me = request.user
    d = body(request)
    if not me.check_password(str(d.get("current", ""))):
        raise ValueError("Your current password isn't right.")
    new = str(d.get("new", ""))
    password_validation.validate_password(new, me)
    me.set_password(new)
    me.save(update_fields=["password"])
    update_session_auth_hash(request, me)  # stay logged in on this device
    return ok()


@require_POST
@api
def settings_signout_others(request):
    me = request.user
    current = request.session.session_key
    removed = 0
    for s in Session.objects.filter(expire_date__gt=timezone.now()).exclude(session_key=current):
        if str(s.get_decoded().get("_auth_user_id")) == str(me.pk):
            s.delete()
            removed += 1
    return ok(removed=removed)


@require_POST
@api
def settings_delete(request):
    me = request.user
    d = body(request)
    if d.get("confirm") != "DELETE":
        raise ValueError("Type DELETE to confirm.")
    if not me.check_password(str(d.get("password", ""))):
        raise ValueError("Your password isn't right.")
    for photo in me.photos.all():
        photo.image.delete(save=False)
    logout(request)
    me.delete()
    return ok()
