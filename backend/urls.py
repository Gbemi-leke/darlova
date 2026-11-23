from django.urls import path

from . import api, views

urlpatterns = [
    # Dashboard pages
    path("discover/", views.discover, name="discover"),
    path("matches/", views.matches, name="matches"),
    path("messages/", views.messages_view, name="messages"),
    path("profile/", views.profile, name="profile"),
    path("my-profile/", views.my_profile, name="my_profile"),
    path("settings/", views.settings_view, name="settings"),
    path("notifications/", views.notifications, name="notifications"),
    path("search/", views.search, name="search"),
    path("notifications/<int:pk>/open/", views.open_notification, name="open_notification"),

    # JSON API used by the page scripts
    path("api/pulse/", api.pulse, name="api_pulse"),
    path("api/push/key/", api.push_key, name="api_push_key"),
    path("api/push/subscribe/", api.push_subscribe, name="api_push_subscribe"),
    path("api/push/unsubscribe/", api.push_unsubscribe, name="api_push_unsubscribe"),
    path("api/push/test/", api.push_test, name="api_push_test"),
    path("api/notifications/read/", api.notifications_read, name="api_notifications_read"),
    path("api/discover/", api.discover, name="api_discover"),
    path("api/swipe/", api.swipe, name="api_swipe"),
    path("api/passes/reset/", api.reset_passes, name="api_reset_passes"),
    path("api/search/", api.search, name="api_search"),
    path("api/filters/", api.save_filters, name="api_filters"),
    path("api/unmatch/", api.unmatch, name="api_unmatch"),
    path("api/block/", api.block, name="api_block"),
    path("api/unblock/", api.unblock, name="api_unblock"),
    path("api/report/", api.report, name="api_report"),

    path("api/chats/", api.chats, name="api_chats"),
    path("api/chats/<int:match_id>/", api.chat_messages, name="api_chat_messages"),
    path("api/chats/<int:match_id>/send/", api.chat_send, name="api_chat_send"),
    path("api/chats/<int:match_id>/typing/", api.chat_typing, name="api_chat_typing"),
    path("api/chats/<int:match_id>/clear/", api.chat_clear, name="api_chat_clear"),
    path("api/messages/<int:msg_id>/react/", api.message_react, name="api_message_react"),
    path("api/messages/<int:msg_id>/unsend/", api.message_unsend, name="api_message_unsend"),

    path("api/profile/", api.profile_save, name="api_profile"),
    path("api/photos/", api.photo_upload, name="api_photo_upload"),
    path("api/photos/<int:photo_id>/delete/", api.photo_delete, name="api_photo_delete"),
    path("api/photos/<int:photo_id>/main/", api.photo_main, name="api_photo_main"),

    path("api/settings/account/", api.settings_account, name="api_settings_account"),
    path("api/settings/prefs/", api.settings_prefs, name="api_settings_prefs"),
    path("api/settings/password/", api.settings_password, name="api_settings_password"),
    path("api/settings/signout-others/", api.settings_signout_others, name="api_settings_signout"),
    path("api/settings/delete/", api.settings_delete, name="api_settings_delete"),
]
