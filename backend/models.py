from django.conf import settings
from django.db import models
from django.db.models import Q
from django.utils import timezone

User = settings.AUTH_USER_MODEL


class Like(models.Model):
    """One member's decision about another: like, super like or pass."""

    LIKE, SUPER, PASS = "like", "super", "pass"
    KIND_CHOICES = [(LIKE, "Like"), (SUPER, "Super like"), (PASS, "Pass")]

    from_user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="likes_sent")
    to_user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="likes_received")
    kind = models.CharField(max_length=5, choices=KIND_CHOICES)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["from_user", "to_user"], name="one_decision_per_pair")]

    def __str__(self):
        return f"{self.from_user} {self.kind} {self.to_user}"


class Match(models.Model):
    """Two members who liked each other. user_a always has the lower id."""

    user_a = models.ForeignKey(User, on_delete=models.CASCADE, related_name="+")
    user_b = models.ForeignKey(User, on_delete=models.CASCADE, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)
    last_message_at = models.DateTimeField(null=True, blank=True, db_index=True)

    # Short-lived chat state
    typing_a_until = models.DateTimeField(null=True, blank=True)
    typing_b_until = models.DateTimeField(null=True, blank=True)
    cleared_a_at = models.DateTimeField(null=True, blank=True)  # "Clear chat" hides older messages for that member
    cleared_b_at = models.DateTimeField(null=True, blank=True)
    seen_a = models.BooleanField(default=False)  # has each member seen the new match yet?
    seen_b = models.BooleanField(default=False)

    class Meta:
        verbose_name_plural = "matches"
        constraints = [models.UniqueConstraint(fields=["user_a", "user_b"], name="one_match_per_pair")]

    def __str__(self):
        return f"{self.user_a} ♥ {self.user_b}"

    # helpers ---------------------------------------------------------------
    @staticmethod
    def pair(u1, u2):
        return (u1, u2) if u1.pk < u2.pk else (u2, u1)

    @classmethod
    def between(cls, u1, u2):
        a, b = cls.pair(u1, u2)
        return cls.objects.filter(user_a=a, user_b=b).first()

    @classmethod
    def for_user(cls, user):
        return cls.objects.filter(Q(user_a=user) | Q(user_b=user))

    def side(self, user):
        return "a" if user.pk == self.user_a_id else "b"

    def other(self, user):
        return self.user_b if user.pk == self.user_a_id else self.user_a

    def has(self, user):
        return user.pk in (self.user_a_id, self.user_b_id)

    def cleared_at(self, user):
        return getattr(self, f"cleared_{self.side(user)}_at")

    def visible_messages(self, user):
        qs = self.messages.all()
        cleared = self.cleared_at(user)
        return qs.filter(created_at__gt=cleared) if cleared else qs

    def is_typing(self, user):
        until = getattr(self, f"typing_{self.side(user)}_until")
        return bool(until and until > timezone.now())


class Message(models.Model):
    match = models.ForeignKey(Match, on_delete=models.CASCADE, related_name="messages")
    sender = models.ForeignKey(User, on_delete=models.CASCADE, related_name="messages_sent")
    body = models.TextField(max_length=2000)
    reply_to = models.ForeignKey("self", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    reaction = models.CharField(max_length=8, blank=True)  # emoji added by the other member
    is_deleted = models.BooleanField(default=False)       # "Unsend" keeps a placeholder
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["id"]

    def __str__(self):
        return f"{self.sender}: {self.body[:40]}"


class Block(models.Model):
    blocker = models.ForeignKey(User, on_delete=models.CASCADE, related_name="blocks_made")
    blocked = models.ForeignKey(User, on_delete=models.CASCADE, related_name="blocks_received")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["blocker", "blocked"], name="one_block_per_pair")]


class Report(models.Model):
    REASONS = [
        ("fake", "Fake profile or scam"),
        ("harassment", "Harassment or bullying"),
        ("inappropriate", "Inappropriate photos or messages"),
        ("underage", "Looks under 18"),
        ("other", "Something else"),
    ]
    reporter = models.ForeignKey(User, on_delete=models.CASCADE, related_name="reports_made")
    reported = models.ForeignKey(User, on_delete=models.CASCADE, related_name="reports_received")
    reason = models.CharField(max_length=20, choices=REASONS)
    details = models.TextField(max_length=1000, blank=True)
    resolved = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.reporter} reported {self.reported} ({self.reason})"


class ProfileView(models.Model):
    """Latest time one member looked at another's profile (powers 'Visitors')."""

    viewer = models.ForeignKey(User, on_delete=models.CASCADE, related_name="+")
    viewed = models.ForeignKey(User, on_delete=models.CASCADE, related_name="profile_views")
    viewed_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["viewer", "viewed"], name="one_view_row_per_pair")]


class Notification(models.Model):
    KINDS = [("match", "Match"), ("like", "Like"), ("super", "Super like"), ("msg", "Message"),
             ("view", "Profile view"), ("system", "System")]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="notifications")
    actor = models.ForeignKey(User, on_delete=models.CASCADE, null=True, blank=True, related_name="+")
    kind = models.CharField(max_length=8, choices=KINDS)
    text = models.CharField(max_length=200)
    link = models.CharField(max_length=200, blank=True)
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"→ {self.user}: {self.text}"
