from django.contrib import admin

from django.contrib import messages

from . import push, services
from .models import Announcement, Block, Like, Match, Message, Notification, ProfileView, PushSubscription, Report


@admin.register(Report)
class ReportAdmin(admin.ModelAdmin):
    list_display = ("reported", "reason", "reporter", "created_at", "resolved")
    list_filter = ("resolved", "reason")
    list_editable = ("resolved",)
    search_fields = ("reported__email", "reported__first_name", "reporter__email")
    raw_id_fields = ("reporter", "reported")


@admin.register(Match)
class MatchAdmin(admin.ModelAdmin):
    list_display = ("user_a", "user_b", "created_at", "last_message_at")
    search_fields = ("user_a__email", "user_b__email")
    raw_id_fields = ("user_a", "user_b")


@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    """For handling reports. Messages are private, so only open them when investigating."""
    list_display = ("sender", "match", "created_at", "is_deleted")
    search_fields = ("sender__email",)
    raw_id_fields = ("match", "sender", "reply_to")


@admin.register(Like)
class LikeAdmin(admin.ModelAdmin):
    list_display = ("from_user", "kind", "to_user", "created_at")
    list_filter = ("kind",)
    raw_id_fields = ("from_user", "to_user")


@admin.register(Block)
class BlockAdmin(admin.ModelAdmin):
    list_display = ("blocker", "blocked", "created_at")
    raw_id_fields = ("blocker", "blocked")


admin.site.register(Notification)
admin.site.register(ProfileView)


@admin.register(Announcement)
class AnnouncementAdmin(admin.ModelAdmin):
    """Send a message to members' notifications — and to their phones if they turned push on."""

    list_display = ("title", "audience", "sent_at", "sent_count")
    readonly_fields = ("sent_at", "sent_count")
    filter_horizontal = ("recipients",)
    fields = ("title", "message", "link", "audience", "recipients", "send_push", "sent_at", "sent_count")
    actions = ["send_again"]

    def save_related(self, request, form, formsets, change):
        super().save_related(request, form, formsets, change)  # recipients are saved here
        a = form.instance
        if not a.sent_at:
            n = services.send_announcement(a)
            phones = "" if push.enabled() else " (phone alerts are off: add VAPID keys to .env)"
            self.message_user(request, f"Sent to {n} member{'s' if n != 1 else ''}{phones}.", messages.SUCCESS)

    @admin.action(description="Send selected announcements again")
    def send_again(self, request, queryset):
        total = sum(services.send_announcement(a) for a in queryset)
        self.message_user(request, f"Sent again ({total} deliveries).", messages.SUCCESS)


@admin.register(PushSubscription)
class PushSubscriptionAdmin(admin.ModelAdmin):
    list_display = ("user", "user_agent", "created_at", "last_used")
    search_fields = ("user__email",)
    raw_id_fields = ("user",)
