from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import Hand, HandCommand, LedgerEntry, Room, RoomSeat, User


@admin.register(User)
class PokerUserAdmin(UserAdmin):
    fieldsets = UserAdmin.fieldsets + (("Poker Friends", {"fields": ("is_guest",)}),)
    list_display = ("username", "email", "is_guest", "is_staff")


class RoomSeatInline(admin.TabularInline):
    model = RoomSeat
    extra = 0


@admin.register(Room)
class RoomAdmin(admin.ModelAdmin):
    list_display = ("name", "status", "small_blind", "big_blind", "owner", "created_at")
    list_filter = ("status",)
    inlines = [RoomSeatInline]


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
class HandAdmin(admin.ModelAdmin):
    list_display = ("room", "hand_no", "button_seat", "created_at", "completed_at")
    list_filter = ("room",)
    inlines = [HandCommandInline]
