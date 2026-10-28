"""What players tell us during the beta, and what their browsers report going wrong.

Write-only over HTTP (apps/feedback/views.py); staff read them in the Django admin. Nothing here
ever holds a cookie, a session or a card: text from the browser is scrubbed before it is saved.
"""

from django.conf import settings
from django.db import models

from apps.games.models import Room


class Feedback(models.Model):
    class Kind(models.TextChoices):
        BUG = "bug", "Lỗi"
        IDEA = "idea", "Ý tưởng"
        OTHER = "other", "Khác"

    # SET_NULL: a guest cleaned up later must not block deleting it, nor delete what it said.
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    room = models.ForeignKey(Room, on_delete=models.SET_NULL, null=True, blank=True)
    page = models.CharField(max_length=500, blank=True)
    message = models.TextField(max_length=2000)
    kind = models.CharField(max_length=10, choices=Kind.choices)
    user_agent = models.CharField(max_length=500, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "phản hồi"
        verbose_name_plural = "phản hồi"

    def __str__(self) -> str:
        return f"{self.get_kind_display()}: {self.message[:60]}"


class ClientError(models.Model):
    """One error a browser reported. The same message on the same page from the same release,
    within one fixed 10-minute window, only raises ``count`` and ``last_seen``: the database
    keeps one row per (fingerprint, window), so two reports racing cannot make two."""

    # sha256 of message, page and release: the texts themselves can be too long to index
    fingerprint = models.CharField(max_length=64)
    message = models.TextField(max_length=1000)
    stack = models.TextField(blank=True)
    page = models.CharField(max_length=500, blank=True)
    user_agent = models.CharField(max_length=500, blank=True)
    release = models.CharField(max_length=64, blank=True)
    # the first player who reported it (null: not logged in)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True
    )
    count = models.PositiveIntegerField(default=1)
    first_seen = models.DateTimeField(auto_now_add=True, db_index=True)  # the daily cap counts it
    last_seen = models.DateTimeField(db_index=True)
    # start of the 10-minute window this row counts (apps/feedback/views.py DUPLICATE_WINDOW)
    window_start = models.DateTimeField()

    class Meta:
        ordering = ["-last_seen"]
        constraints = [
            models.UniqueConstraint(
                fields=["fingerprint", "window_start"], name="clienterror_one_per_window"
            )
        ]
        verbose_name = "lỗi trình duyệt"
        verbose_name_plural = "lỗi trình duyệt"

    def __str__(self) -> str:
        return f"×{self.count} {self.message[:60]}"
