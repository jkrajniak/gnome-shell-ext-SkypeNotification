/**
 * gnome-shell-extension-SkypeNotification
 * Skype GnomeShell Integration.
 *  
 * This file is part of gnome-shell-extension-SkypeNotification.
 *
 * gnome-shell-ext-SkypeNotification is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * gnome-shell-ext-SkypeNotification  is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with gnome-shell-ext-SkypeNotification  If not, see <http://www.gnu.org/licenses/>.
 *
 */

const IMStatusChooserItem = imports.ui.userMenu.IMStatusChooserItem;
const Lang = imports.lang;

const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;

const Main = imports.ui.main;
const MessageTray = imports.ui.messageTray;

const Config = imports.misc.config;
const SimpleXML = imports.misc.extensionUtils.getCurrentExtension().imports.simpleXml.SimpleXML;


const SkypeIface = <interface name="com.Skype.API">
<method name="Invoke">
    <arg type="s" direction="in"/>
    <arg type="s" direction="out"/>
</method>
</interface>;

const SkypeIfaceClient = <interface name="com.Skype.API.Client">
<method name="Notify">
    <arg type="s" direction="in"/>
</method>
</interface>;

const SkypeProxy = Gio.DBusProxy.makeProxyWrapper(SkypeIface);


const SkypeStatus = {
    OFFLINE: 1,
    ONLINE: 2,
    DND: 6
}

const Skype = new Lang.Class({
    Name: "Skype",

    _init: function() {
        this._enabled = false;
        this._authenticated = false;
        this._currentUserHandle = "";
        this._config = null;
        this._isGnome38 = (Config.PACKAGE_VERSION.indexOf("3.8") == 0);

        this._messages = [];

        this._proxy = new SkypeProxy(Gio.DBus.session, "com.Skype.API", "/com/Skype");
        this._dbusImpl = Gio.DBusExportedObject.wrapJSObject(SkypeIfaceClient, this);

        this._authenticate();
        this._heartBeat();
    },

    _authenticate: function() {
        this._proxy.InvokeRemote("NAME GnomeShellExtension", Lang.bind(this, this._onAuthenticate));
    },

    _heartBeat: function() {
        this._proxy.InvokeRemote("GET SKYPEVERSION", Lang.bind(this, this._onHeartBeat));
    },

    _onAuthenticate: function(answer) {
        if(answer == "OK") {
            this._proxy.InvokeRemote("PROTOCOL 7");
            this._dbusImpl.export(Gio.DBus.session, "/com/Skype/Client");
        } else if(!this._authenticated && answer != "ERROR 68") {
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, Lang.bind(this, this._authenticate));
        }
    },

    _onHeartBeat: function(answer) {
        if(this._authenticated && answer == "ERROR 68") {
            this._authenticated = false;
            this._authenticate();
        }
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2500, Lang.bind(this, this._heartBeat));
    },

    enable: function() {
        this._enabled = true;
        if(this._config != null) {
            this._config.toggle(this._enabled);
        }
    },

    disable: function() {
        this._enabled = false;
        if(this._config != null) {
            this._config.toggle(this._enabled);
        }
    },

    updateSkypeStatus: function(presence) {
        global.log("presence: " + presence);
        switch(presence) {
            case SkypeStatus.DND:
                this._proxy.InvokeRemote("SET USERSTATUS DND");
                break;
            case SkypeStatus.OFFLINE:
                this._proxy.InvokeRemote("SET USERSTATUS OFFLINE");
                break;
            case SkypeStatus.ONLINE:
            default:
                this._proxy.InvokeRemote("SET USERSTATUS ONLINE");
        }
    },

    _retrieve: function(request) {
        let [response] = this._proxy.InvokeSync(request);
        let parts = response.split(" ");
        parts.splice(0, 3);
        return parts.join(" ");
    },

    _getUserName: function(userHandle) {
        let displayName = this._retrieve("GET USER %s DISPLAYNAME".format(userHandle));
        if(displayName != "") {
            return displayName;
        }
        let userName = this._retrieve("GET USER %s FULLNAME".format(userHandle));
        if(userName != "") {
        	return userName;
        }
        return userHandle;
    },

    _hasAnyoneBirthday: function() {
        let today = new Date();
        let tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

        let todayString = "%02d%02d".format(today.getMonth() + 1, today.getDate());
        let tomorrowString = "%02d%02d".format(tomorrow.getMonth() + 1, tomorrow.getDate());

        let [friends] = this._proxy.InvokeSync("SEARCH FRIENDS");
        if(friends.indexOf("USERS ") !== -1) {
            friends = friends.replace("USERS ", "").split(",");
            for(let friend in friends) {
                if(this._isBirthday(this._retrieve("GET USER %s BIRTHDAY".format(friends[friend])), tomorrowString)) {
                    let userName = this._getUserName(friends[friend]);
                    this._notify(this._config.getNotification("Birthday", {"contact": userName}));
                }
            }
        }

        let [myBirthday] = this._proxy.InvokeSync("GET PROFILE BIRTHDAY");
        if(this._isBirthday(myBirthday.replace("PROFILE BIRTHDAY ", ""), todayString)) {
            this._notify(this._config.getNotification("OurBirthday", {"contact": this._getUserName(this._currentUserHandle)}));
        }
    },

    _isBirthday: function(birthday, day) {
        if(birthday.length > 4 && birthday.substr(4) == day) {
            return true;
        }
        return false;
    },

    _getNotifySource: function() {
        let source = null;
        let items = null;

        if(this._isGnome38) {
            items = Main.messageTray.getSources();
        } else {
            items = Main.messageTray.getSummaryItems();
        }

        let item = null; 
        for(let index in items) {
            if(this._isGnome38) {
                item = items[index];
            } else {
                item = items[index].source;
            }
            global.log(" ## " + item.title + " (" + item.initialTitle + ")");
            if(item.title == "Skype") {
                if(item.initialTitle == "Skype") {
                    source = item;
                } else {
                    item.destroy();
                    global.log(" -- destroyed");
                }
            }
        }

        return source;
    },

    _onClose: function() {
        this._messages = [];
    },

    _notify: function(message) {
        if(message == null) {
            return;
        }
        this._messages.push(message);

        let source = this._getNotifySource();
        if(source == null) {
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, Lang.bind(this, this._notify));
            return;
        }

        let items = this._messages; 
        items.reverse();

        let summary = "Skype";
        let body = [];
        let icon = "skype";

        if(this._messages.length > 1) {
            for(let index in items) {
                if(items[index].body.length > 0) {
                    body.push([items[index].summary, items[index].body].join(": "));
                } else {
                    body.push(items[index].summary);
                }
                body.push("\n");
            }
        } else {
            for(let index in items) {
                summary = items[index].summary;
                body.push(items[index].body);
                icon = items[index].icon;
            }
        }
        body = body.join("").trim();

        let notifications = source.notifications;
        let notification = null;

        if(source.count == 0) {
            notification = new MessageTray.Notification(source, summary, body);
            notification.setTransient(true);
            notification.connect("collapsed", Lang.bind(this, this._onClose));
            source.notify(notification);
            global.log(" ++ notified");
        } else {
            notification = notifications[0];
            notification.update(summary, body);
            global.log(" ++ updated");
        }
    },

    NotifyAsync: function(params) {
        if(!this._enabled) {
            return;
        }

        let [message] = params;
        global.log(message);

        if(message.indexOf("CURRENTUSERHANDLE ") !== -1) {
            this._currentUserHandle = message.replace("CURRENTUSERHANDLE ", "");
            this._config = new SkypeConfig(this._currentUserHandle);
            this._config.toggle(this._enabled);
            this._authenticated = true;
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 5000, Lang.bind(this, this._hasAnyoneBirthday));
        } else if(message.indexOf("VOICEMAIL ") !== -1) {
            let voicemail = message.split(" ");
            if(voicemail[2] == "TYPE") {
                if(voicemail[3] == "INCOMING") {
                    let userHandle = this._retrieve("GET VOICEMAIL %s PARTNER_HANDLE".format(voicemail[1]));
                    let userName = this._getUserName(userHandle);
                    this._notify(this._config.getNotification("VoicemailReceived", {"contact": userName}));
                } else if(voicemail[3] == "VoicemailSent") {
                    this._notify(this._config.getNotification("VoicemailReceived", {}));
                }
            }
        } else if(message.indexOf("CHAT ") !== -1) {
            let chat = message.split(" ");

            if(chat[2] == "ACTIVITY_TIMESTAMP") {
                let chatName = this._retrieve("GET CHAT %s FRIENDLYNAME".format(chat[1]));
                let recent = this._proxy.InvokeSync("GET CHAT %s RECENTCHATMESSAGES".format(chat[1])).toString();
                recent = recent.replace("CHAT %s RECENTCHATMESSAGES".format(chat[1]), "").split(",");

                let state = "";
                if(recent.length > 0) {
                    global.log("    recent: " + recent[recent.length - 1]);
                    state = this._retrieve("GET CHATMESSAGE %s STATUS".format(recent[recent.length - 1]));
                }

                global.log(" ** STATE: " + state);
                if(state != "RECEIVED" && state != "SENDING") {
                    this._notify(this._config.getNotification("ChatIncomingInitial", {"chat": chatName}));
                }
            }
        } else if(message.indexOf("CHATMESSAGE ") !== -1) {
            let messageId = message.split(" ")[1];
            let messageBody = this._retrieve("GET CHATMESSAGE %s BODY".format(messageId));
            let userHandle = this._retrieve("GET CHATMESSAGE %s FROM_HANDLE".format(messageId));
            let state = this._retrieve("GET CHATMESSAGE %s STATUS".format(messageId));
            let userName = this._getUserName(userHandle);

            if(state == "RECEIVED") {
                this._notify(this._config.getNotification("ChatIncoming", {"contact": userName, "message": messageBody}));
            } else if(state == "SENDING") {
                this._notify(this._config.getNotification("ChatOutgoing", {"contact": userName, "message": messageBody}));
            }
        } else if(message.indexOf("USER ") !== -1) {
            let user = message.split(" ");
            let userName = this._getUserName(user[1]);
            if(user[2] == "ONLINESTATUS") {
                if(user[3] == "ONLINE" && user[1] != this._currentUserHandle) {
                    this._notify(this._config.getNotification("ContactOnline", {"contact": userName}));
                } else if(user[3] == "OFFLINE" && user[1] != this._currentUserHandle) {
                    this._notify(this._config.getNotification("ContactOffline", {"contact": userName}));
                } else if(user[3] == "SUBSCRIBED") {
                    this._notify(this._config.getNotification("ChatJoined", {"contact": userName, "message": user[3]}));
                } else if(user[3] == "UNSUBSCRIBED") {
                    this._notify(this._config.getNotification("ChatParted", {"contact": userName, "message": user[3]}));
                }
            } else if(user[2] == "RECEIVEDAUTHREQUEST") {
                this._notify(this._config.getNotification("ContactOnline", {"contact": userName, "message": user[3]}));
            } else if(user[2] == "BUDDYSTATUS") {
                if(user[3] == "1") {
                    this._notify(this._config.getNotification("ContactDeleted", {"contact": userName}));
                } else if(user[3] == "3") {
                    this._notify(this._config.getNotification("ContactAdded", {"contact": userName}));
                }
            }
        } else if(message.indexOf("FILETRANSFER ") !== -1) {
            let transfer = message.split(" ");
            if(transfer[2] == "STATUS") {
                if(transfer[3] == "NEW") {
                    let type = this._retrieve("GET FILETRANSFER %s TYPE".format(transfer[1]));
                    if(type == "INCOMING") {
                        let userHandle = this._retrieve("GET FILETRANSFER %s PARTNER_HANDLE".format(transfer[1]));
                        let userName = this._getUserName(userHandle);
                        this._notify(this._config.getNotification("TransferRequest", {"contact": userName}));
                    }
                } else if(transfer[3] == "COMPLETED") {
                    let fileName = this._retrieve("GET FILETRANSFER %s FILENAME".format(transfer[1]));
                    let filePath = this._retrieve("GET FILETRANSFER %s FILEPATH".format(transfer[1]));
                    this._notify(this._config.getNotification("TransferComplete", {"filename": fileName, "filepath": filePath}));
                } else if(transfer[3] == "CANCELLED") {
                    let fileName = this._retrieve("GET FILETRANSFER %s FILENAME".format(transfer[1]));
                    this._notify(this._config.getNotification("TransferFailed", {"filename": fileName}));
                }
            }
        } else if(message.indexOf("SMS ") !== -1) {
            let sms = message.split(" ");
            if(sms[2] == "STATUS") {
                if(sms[3] == "DELIVERED") {
                    this._notify(this._config.getNotification("SMSSent", {}));
                } else if(sms[3] == "FAILED") {
                    this._notify(this._config.getNotification("SMSFailed", {}));
                }
            }
        }
    }
});

const SkypeConfig = new Lang.Class({
    Name: "SkypeConfig",

    _init: function(currentUserHandle) {
        this._file = GLib.get_home_dir() + "/.Skype/" + currentUserHandle + "/config.xml";

        let config = Gio.file_new_for_path(this._file);
        if(!config.query_exists(null)) {
            this._file = GLib.get_tmp_dir() + "/skype.xml";
        }

        this._options = {
                "VoicemailReceived": {
                    "enabled": false, "config": ["VoicemailReceived", "VoicemailReceived", 1],
                    "notification": [ "{contact}", "Voicemail Received", "emblem-shared" ]},
                "VoicemailSent": {
                    "enabled": false, "config": ["VoicemailSent", "VoicemailSent", 0],
                    "notification": [ "Voicemail Sent", "", "document-send" ]},
                "ContactOnline": {
                    "enabled": false, "config": ["Online", "ContactOnline", 1],
                    "notification": [ "{contact} is now online", "", "user-online" ]},
                "ContactOffline": {
                    "enabled": false, "config": ["Offline", "ContactOffline", 1],
                    "notification": [ "{contact} is now offline", "", "user-offline" ]},
                "ContactAuthRequest": {
                    "enabled": false, "config": ["Authreq", "ContactAuthRequest", 1],
                    "notification": [ "Contact request from {contact}", "{message}", "contact-new" ]},
                "ContactAdded": {
                    "enabled": false, "config": ["ContactAdded", "ContactAdded", 1],
                    "notification": [ "{contact} has been added to your contact list", "", "address-book-new" ]},
                "ContactDeleted": {
                    "enabled": false, "config": ["ContactDeleted", "ContactDeleted", 1],
                    "notification": [ "{contact} has been deleted from your contact list", "", "edit-delete" ]},
                "ChatIncomingInitial": {
                    "enabled": true, "config": ["", "", 1],
                    "notification": [ "{chat}", "", "im-message-new" ]},
                "ChatIncoming": {
                    "enabled": false, "config": ["Chat", "ChatIncoming", 1],
                    "notification": [ "{contact}", "{message}", "im-message-new" ]},
                "ChatOutgoing": {
                    "enabled": false, "config": ["ChatOutgoing", "ChatOutgoing", 0],
                    "notification": [ "{contact}", "{message}", "im-message-new" ]},
                "ChatJoined": {
                    "enabled": false, "config": ["ChatJoined", "ChatJoined", 0],
                    "notification": [ "{contact} joined chat", "{message}", "system-users" ]},
                "ChatParted": {
                    "enabled": false, "config": ["ChatParted", "ChatParted", 0],
                    "notification": [ "{contact} left chat", "{message}", "system-users" ]},
                "TransferRequest": {
                    "enabled": false, "config": ["TransferRequest", "TransferRequest", 1],
                    "notification": [ "Incomming file from {contact}", "", "gtk-save" ]},
                "TransferComplete": {
                	"enabled": false, "config": ["TransferComplete", "TransferComplete", 1],
                	"notification": [ "Transfer Complete", "{filename} saved to {filepath}", "gtk-save" ]},
                "TransferFailed": {
                    "enabled": false, "config": ["TransferFailed", "TransferFailed", 1],
                    "notification": [ "Transfer Failed", "{filename}", "gtk-close" ]},
                "SMSSent": {
                    "enabled": false, "config": ["SMSSent", "SMSSent", 1],
                    "notification": [ "SMS Sent", "", "document-send" ]},
                "SMSFailed": {
                    "enabled": false, "config": ["SMSFailed", "SMSFailed", 1],
                    "notification": [ "SMS Failed", "", "gtk-close" ]},
                "Birthday": {
                    "enabled": false, "config": ["Birthday", "Birthday", 1],
                    "notification": [ "{contact} has a birthday Tomorrow", "", "appointment-soon" ]},
                "OurBirthday": {
                    "enabled": false, "config": ["OurBirthday", "OurBirthday", 1],
                    "notification": [ "Happy Birthday {contact}", "", "emblem-favorite" ]}
        };
    },

    getNotification: function(type, params) {
        let item = this._options[type];
        if(typeof item !== "undefined" && item.enabled) {
            let notification = { "summary": item.notification[0],
                    "body": item.notification[1], "icon": item.notification[2] };
            for(let token in params) {
                notification.summary = notification.summary.replace("{%s}".format(token), params[token]);
                notification.body = notification.body.replace("{%s}".format(token), params[token]);
            }
            return notification;
        }
        return null;
    },

    _get: function(xml, root, name, value) {
        let element = xml.find(root, name);
        if(typeof element === "undefined") {
            element = xml.subElement(root, name);
            element.data = [value];
        }
        return element;
    },

    _set: function(params) {
        let [xml, toggle, notify, enalbe, script, ntag, stag, preset] = params;

        this._get(xml, script, stag, "ls");
        let ntagElement = this._get(xml, notify, ntag, preset);
        let stagElement = this._get(xml, enalbe, stag, preset^1);

        if(toggle) {
            if(parseInt(ntagElement.data) == 1 || parseInt(stagElement.data) == 1) {
                ntagElement.data = [0];
                stagElement.data = [1];
                return true;
            } else {
                stagElement.data = [0];
                return false;
            }
        } else {
            if(parseInt(ntagElement.data) == 1 || parseInt(stagElement.data) == 1) {
                ntagElement.data = [1];
                stagElement.data = [0];
                return true;
            } else {
                ntagElement.data = [0];
                return false;
            }
        }
    },

    toggle: function(toggle) {
        let xml = new SimpleXML();
        xml.parseFile(this._file);

        let root = xml.getRoot();
        let ui = this._get(xml, root, "UI", "");
        let notify = this._get(xml, ui, "Notify", "");
        let notifications = this._get(xml, ui, "Notifications", "");
        let notificationsEnable = this._get(xml, notifications, "Enable", "");
        let notificationsEnableScripts = this._get(xml, notificationsEnable, "Scripts", "");
        let notificationsScripts = this._get(xml, notifications, "Scripts", "");

        let params = [xml, toggle, notify, notificationsEnableScripts, notificationsScripts];
        for(let key in this._options) {
            if(!this._options[key].enabled) {
                this._options[key].enabled = this._set(params.concat(this._options[key].config));
            }
        }

        xml.write(this._file);
    }
});

let skype = null;
function init() {
    skype = new Skype();
}

function enable() {
    skype.enable();

    IMStatusChooserItem.prototype._setComboboxPresenceOrig = IMStatusChooserItem.prototype._setComboboxPresence;
    IMStatusChooserItem.prototype._setComboboxPresence = function(presence) {
        this._setComboboxPresenceOrig(presence);
        skype.updateSkypeStatus(presence);
    };
}

function disable() {
    skype.disable();

    if(typeof IMStatusChooserItem.prototype._setComboboxPresenceOrig === "function") {
        IMStatusChooserItem.prototype._setComboboxPresence = IMStatusChooserItem.prototype._setComboboxPresenceOrig;
        IMStatusChooserItem.prototype._setComboboxPresenceOrig = undefined;
    }
}
