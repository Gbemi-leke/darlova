from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.utils.html import format_html

from .models import Photo, Profile, User


class ProfileInline(admin.StackedInline):
    model = Profile
    can_delete = False
    extra = 0


class PhotoInline(admin.TabularInline):
    model = Photo
    extra = 0
    fields = ("preview", "image", "order")
    readonly_fields = ("preview",)

    def preview(self, obj):
        if obj.pk and obj.image:
            return format_html('<img src="{}" style="height:80px;border-radius:8px">', obj.image.url)
        return ""


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    ordering = ("-date_joined",)
    list_display = ("email", "first_name", "phone", "is_verified", "date_joined", "last_seen", "is_active")
    search_fields = ("email", "first_name", "phone")
    inlines = [ProfileInline, PhotoInline]
    fieldsets = (
        (None, {"fields": ("email", "password")}),
        ("Personal info", {"fields": ("first_name", "last_name", "phone")}),
        ("Permissions", {"fields": ("is_active", "is_staff", "is_superuser", "groups", "user_permissions")}),
        ("Important dates", {"fields": ("last_login", "date_joined", "last_seen")}),
    )
    add_fieldsets = (
        (None, {"classes": ("wide",), "fields": ("email", "first_name", "password1", "password2")}),
    )

    @admin.display(boolean=True, description="Verified")
    def is_verified(self, obj):
        return hasattr(obj, "profile") and obj.profile.is_verified


@admin.register(Profile)
class ProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "gender", "city", "looking_for", "is_verified", "created_at")
    list_filter = ("gender", "city", "looking_for", "is_verified")
    search_fields = ("user__email", "user__first_name", "city")
    list_editable = ("is_verified",)
