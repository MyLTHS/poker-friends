from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import (
    ChatMessage,
    Hand,
    HandCommand,
    LedgerEntry,
    OwnerAction,
    Room,
    RoomBan,
    RoomMember,
    RoomSeat,
    User,
)


class ViewOnlyAdmin(admin.ModelAdmin):
    """Shown, never changed here: the table actor or an append-only rule owns these rows."""

    def has_add_permission(self, request, obj=None):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(User)
class PokerUserAdmin(UserAdmin):
    fieldsets = UserAdmin.fieldsets + (("Poker Friends", {"fields": ("is_guest",)}),)
    list_display = ("username", "email", "is_guest", "is_staff")

    def has_delete_permission(self, request, obj=None):
        # Deleting cascades to seats, bans and memberships behind the table actor's back, and
        # ledger rows protect the rest anyway. Untick "active" to lock an account instead.
        return False


class RoomSeatInline(admin.TabularInline):
    model = RoomSeat
    extra = 0

    def has_add_permission(self, request, obj=None):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(Room)
class RoomAdmin(ViewOnlyAdmin):
    """Read-only: settings, status and seats live in the room's table actor, which would not see
    an edit made here. Staff change a room through the owner's page (web /rooms/<id>), which goes
    through the actor and is logged in OwnerAction."""

    list_display = (
        "name",
        "status",
        "is_private",
        "small_blind",
        "big_blind",
        "owner",
        "created_at",
    )
    list_filter = ("status", "is_private")
    exclude = ("invite_token",)
    inlines = [RoomSeatInline]


@admin.register(OwnerAction)
class OwnerActionAdmin(ViewOnlyAdmin):
    list_display = ("created_at", "room", "user", "by_staff", "kind", "details")
    list_filter = ("kind", "by_staff", "room")


@admin.register(ChatMessage)
class ChatMessageAdmin(admin.ModelAdmin):
    """Abusive lines may be deleted; nothing else."""

    list_display = ("created_at", "room", "user", "text")
    list_filter = ("room",)
    search_fields = ("text", "user__username")

    def has_add_permission(self, request, obj=None):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(RoomMember)
class RoomMemberAdmin(ViewOnlyAdmin):
    list_display = ("room", "user", "created_at")
    list_filter = ("room",)


@admin.register(RoomBan)
class RoomBanAdmin(admin.ModelAdmin):
    """Deleting a ban lets that person back in at once: the table reads bans from the database
    on every connection and seat request."""

    list_display = ("room", "user", "created_at")
    list_filter = ("room",)

    def has_add_permission(self, request, obj=None):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(LedgerEntry)
class LedgerEntryAdmin(admin.ModelAdmin):
    list_display = ("room", "user", "kind", "amount", "hand", "created_at")
    list_filter = ("room", "kind")
    # Append-only: the admin must not offer ways to edit or delete a settled entry.
    readonly_fields = ("room", "user", "kind", "amount", "hand", "created_at")

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


class HandCommandInline(admin.TabularInline):
    model = HandCommand
    extra = 0
    readonly_fields = ("sequence", "player", "command_id", "kind", "amount", "created_at")


@admin.register(Hand)
class HandAdmin(ViewOnlyAdmin):
    list_display = ("room", "hand_no", "button_seat", "created_at", "completed_at")
    list_filter = ("room",)
    inlines = [HandCommandInline]
