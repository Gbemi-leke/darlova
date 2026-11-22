from django.contrib import admin

from .models import Block, Like, Match, Message, Notification, ProfileView, Report


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
