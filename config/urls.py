"""
URL configuration for config project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.1/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""

from django.contrib import admin
from django.urls import include, path

from apps.feedback import views as feedback_views
from apps.games import history, rooms
from apps.games import views as games_views

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/rooms/", rooms.rooms_collection),
    path("api/rooms/join/", rooms.join),
    path("api/rooms/<int:room_id>/", rooms.room_item),
    path("api/rooms/<int:room_id>/chips/", rooms.grant_chips),
    path("api/rooms/<int:room_id>/kick/", rooms.kick),
    path("api/rooms/<int:room_id>/close/", rooms.close),
    path("api/rooms/<int:room_id>/invite/", rooms.rotate_invite),
    path("api/rooms/<int:room_id>/chat/", history.chat_history),
    path("api/rooms/<int:room_id>/hands/", history.list_hands),
    path("api/rooms/<int:room_id>/summary/", history.room_summary),
    path("api/hands/<int:hand_id>/replay/", history.hand_replay),
    path("api/rooms/<int:room_id>/seats/", games_views.take_seat),
    path("api/rooms/<int:room_id>/seats/me/", games_views.leave_seat),
    path("api/rooms/<int:room_id>/rebuy/", games_views.rebuy),
    path("api/rooms/<int:room_id>/snapshot/", games_views.get_snapshot),
    path("api/feedback/", feedback_views.feedback),
    path("api/client-errors/", feedback_views.client_errors),
    path("", include("apps.accounts.urls")),  # B6: /api/auth/ and the Google flow
]
