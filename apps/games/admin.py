from django import forms
from django.contrib import admin, messages
from django.contrib.auth.admin import UserAdmin
from django.utils.html import format_html

from apps.accounts import services

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


class PlayerCreationForm(forms.ModelForm):
    """ "Add user" makes a player: an email and a table name. The player gets an invitation
    email and sets their own password from it (services.create_player); staff never choose it."""

    email = forms.EmailField(
        label="Email", help_text="Thư mời gửi tới đây; người chơi đăng nhập bằng email này."
    )

    class Meta:
        model = User
        fields = ("email", "username")
        labels = {"username": "Tên ở bàn"}

    MESSAGES = {
        "email_taken": ("email", "Email này đã có tài khoản."),
        "username_taken": ("username", "Tên này đã có người dùng."),
    }

    def clean(self):
        cleaned = super().clean()
        email = cleaned.get("email")
        if email and services.email_in_use(services.normalize_email(email)):
            self.add_error("email", self.MESSAGES["email_taken"][1])
        username = cleaned.get("username")
        if username and services.username_in_use(username):  # "An" and "an" too
            self.add_error("username", self.MESSAGES["username_taken"][1])
        return cleaned

    def save(self, commit=True):
        data = self.cleaned_data
        try:
            return services.create_player(data["email"], data["username"])
        except services.AccountError as error:  # lost a race with another sign-up
            field, message = self.MESSAGES.get(error.code, (None, error.message))
            raise forms.ValidationError({field: message} if field else message) from error

    def save_m2m(self):
        """Nothing to add: the admin calls this after save()."""


def invitation_sent(user: User, link: str):
    days = services.INVITE_MAX_AGE // (24 * 60 * 60)
    return format_html(
        "Đã gửi thư mời tới {}. Nếu thư không tới, gửi link này cho {} qua Zalo/Messenger "
        '(dùng một lần, trong {} ngày): <a href="{}">{}</a>',
        user.email,
        user.username,
        days,
        link,
        link,
    )


@admin.register(User)
class PokerUserAdmin(UserAdmin):
    fieldsets = UserAdmin.fieldsets + (("Poker Friends", {"fields": ("is_guest", "approved")}),)
    list_display = ("username", "email", "date_joined", "approved", "is_guest", "is_staff")
    list_filter = ("approved", "is_guest", "is_staff", "is_active")
    ordering = ("-date_joined",)
    actions = ["approve", "withdraw_approval", "invite_again"]

    @admin.action(description="Duyệt (cho vào chơi, xác minh luôn email)")
    def approve(self, request, queryset):
        from apps.accounts.services import mark_email_verified

        people = list(queryset.filter(is_guest=False).exclude(email=""))
        for user in people:
            mark_email_verified(user)
        queryset.filter(pk__in=[u.pk for u in people]).update(approved=True)
        self.message_user(request, f"Đã duyệt {len(people)} tài khoản.")

    @admin.action(description="Bỏ duyệt (không cho vào chơi nữa)")
    def withdraw_approval(self, request, queryset):
        from asgiref.sync import async_to_sync

        from apps.games.actor import drop_player_everywhere
        from apps.games.consumers import LOGIN_REQUIRED_CLOSE_CODE

        ids = list(queryset.values_list("pk", flat=True))
        count = queryset.update(approved=False)
        for user_id in ids:  # out of every table now, even one only watching
            async_to_sync(drop_player_everywhere)(user_id, LOGIN_REQUIRED_CLOSE_CODE)
        self.message_user(request, f"Đã bỏ duyệt {count} tài khoản.")

    add_form = PlayerCreationForm
    add_fieldsets = (
        (
            "Người chơi mới",
            {
                "description": "Nhập email và tên ở bàn. Người chơi nhận thư mời, tự đặt mật khẩu "
                "từ link trong thư rồi đăng nhập bằng email này. Link mời cũng hiện ở đây sau "
                "khi lưu, để gửi qua tin nhắn nếu thư không tới.",
                "fields": ("email", "username"),
            },
        ),
    )

    def response_add(self, request, obj, post_url_continue=None):
        # create_player already emailed the invitation; this link is a second, equally valid one.
        self.message_user(request, invitation_sent(obj, services.invitation_link(obj)))
        return super().response_add(request, obj, post_url_continue)

    @admin.action(description="Gửi lại thư mời (người chơi chưa đặt mật khẩu)")
    def invite_again(self, request, queryset):
        for user in queryset.order_by("pk"):
            if user.is_guest or not user.email:
                self.message_user(
                    request, f"{user.username} không có email nên không gửi được.", messages.WARNING
                )
            elif user.has_usable_password():
                self.message_user(
                    request,
                    f"{user.username} đã tự đặt mật khẩu; quên thì dùng “Quên mật khẩu”.",
                    messages.WARNING,
                )
            else:
                self.message_user(request, invitation_sent(user, services.invite_player(user)))

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

    def get_fields(self, request, obj=None):
        fields = super().get_fields(request, obj)
        if obj is not None and obj.completed_at is None:
            # A running hand's config holds the deck: every hole card and the board still to
            # come, which nobody may see (spec.md), staff included. Shown once the hand is over.
            return [field for field in fields if field != "config"]
        return fields
