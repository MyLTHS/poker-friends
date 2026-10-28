from allauth.socialaccount.models import SocialAccount
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.validators import UnicodeUsernameValidator
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from apps.games.models import User

from .services import is_email_verified


def username_field(**kwargs) -> serializers.CharField:
    return serializers.CharField(
        min_length=2, max_length=30, validators=[UnicodeUsernameValidator()], **kwargs
    )


def check_password(password: str, user: User) -> None:
    try:
        validate_password(password, user)
    except DjangoValidationError as error:
        raise serializers.ValidationError({"password": list(error.messages)}) from error


class SignupSerializer(serializers.Serializer):
    email = serializers.EmailField(max_length=254)
    username = username_field()
    password = serializers.CharField(max_length=128, trim_whitespace=False)

    def validate(self, attrs):
        check_password(attrs["password"], User(username=attrs["username"], email=attrs["email"]))
        return attrs


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField(max_length=254)
    password = serializers.CharField(max_length=128, trim_whitespace=False)


class EmailSerializer(serializers.Serializer):
    email = serializers.EmailField(max_length=254)


class TokenSerializer(serializers.Serializer):
    token = serializers.CharField(max_length=512)


class ResetPasswordSerializer(serializers.Serializer):
    uid = serializers.CharField(max_length=64)
    token = serializers.CharField(max_length=128)
    password = serializers.CharField(max_length=128, trim_whitespace=False)


class GuestSerializer(serializers.Serializer):
    username = username_field(required=False)


class UpgradeSerializer(serializers.Serializer):
    email = serializers.EmailField(max_length=254)
    password = serializers.CharField(max_length=128, trim_whitespace=False)
    username = username_field(required=False)

    def validate(self, attrs):
        user = self.context["user"]
        candidate = User(
            pk=user.pk, username=attrs.get("username", user.username), email=attrs["email"]
        )
        check_password(attrs["password"], candidate)
        return attrs


class MeSerializer(serializers.ModelSerializer):
    email = serializers.SerializerMethodField()
    email_verified = serializers.SerializerMethodField()
    has_password = serializers.SerializerMethodField()
    google_connected = serializers.SerializerMethodField()
    member = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "is_guest",
            "email_verified",
            "has_password",
            "google_connected",
            "member",
        ]

    def get_email(self, user) -> str | None:
        return user.email or None

    def get_email_verified(self, user) -> bool:
        return is_email_verified(user)

    def get_has_password(self, user) -> bool:
        return user.has_usable_password()

    def get_member(self, user) -> bool:
        """May reach the rooms: always where guests may play, else approved by the owner."""
        from django.conf import settings

        from .middleware import is_member

        return settings.GUESTS_ALLOWED or is_member(user)

    def get_google_connected(self, user) -> bool:
        return SocialAccount.objects.filter(user=user, provider="google").exists()
