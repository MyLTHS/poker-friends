from django.contrib import admin

from .models import ClientError, Feedback


class ReadOnlyAdmin(admin.ModelAdmin):
    """Players wrote these; staff read them and may delete one, never edit what was said."""

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(Feedback)
class FeedbackAdmin(ReadOnlyAdmin):
    list_display = ("created_at", "kind", "user", "room", "page", "short_message")
    list_filter = ("kind", "room")
    search_fields = ("message", "page", "user__username")
    date_hierarchy = "created_at"

    @admin.display(description="Nội dung")
    def short_message(self, obj: Feedback) -> str:
        return obj.message[:120]


@admin.register(ClientError)
class ClientErrorAdmin(ReadOnlyAdmin):
    list_display = ("last_seen", "count", "short_message", "page", "release", "user")
    list_filter = ("release",)
    search_fields = ("message", "page", "stack")
    date_hierarchy = "last_seen"
    exclude = ("fingerprint",)

    @admin.display(description="Lỗi")
    def short_message(self, obj: ClientError) -> str:
        return obj.message[:120]
