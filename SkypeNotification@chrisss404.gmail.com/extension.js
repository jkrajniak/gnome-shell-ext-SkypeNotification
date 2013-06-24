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

const Lang = imports.lang;

const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const St = imports.gi.St

const Config = imports.misc.config;
const Me = imports.misc.extensionUtils.getCurrentExtension();
const Util = imports.misc.util;

const IMStatusChooserItem = imports.ui.userMenu.IMStatusChooserItem;
const Main = imports.ui.main;
const MessageTray = imports.ui.messageTray;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;

const SimpleXML = Me.imports.simpleXml.SimpleXML;


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

const SkypeIfaceExtension = <interface name="com.Skype.API.Extension">
<method name="Notify">
    <arg type="s" direction="in" name="type"/>
    <arg type="s" direction="in" name="sname"/>
    <arg type="s" direction="in" name="sskype"/>
    <arg type="s" direction="in" name="smessage"/>
    <arg type="s" direction="in" name="fpath"/>
    <arg type="s" direction="in" name="fsize"/>
    <arg type="s" direction="in" name="fname"/>
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
        this._skypeMenu = null;
        this._apiExtension = new SkypeAPIExtension(Lang.bind(this, this.NotifyCallback));
        this._isGnome38 = (Config.PACKAGE_VERSION.indexOf("3.8") == 0);

        this._enableIcons("16x16");
        this._enableIcons("32x32");

        this._messages = [];

        this._proxy = new SkypeProxy(Gio.DBus.session, "com.Skype.API", "/com/Skype");
        this._dbusImpl = Gio.DBusExportedObject.wrapJSObject(SkypeIfaceClient, this);

        this._heartBeat();
    },

    _enableIcons: function(size) {
        let updateIconCache = false;
        let sharedIconsDirectory = Gio.file_new_for_path(GLib.get_user_data_dir() + "/icons/hicolor/" + size+ "/status");
        if(!sharedIconsDirectory.query_exists(null)) {
            sharedIconsDirectory.make_directory_with_parents(null);
        }

        let directory = Gio.file_new_for_path(Me.path + "/icons/" + size);
        let list = directory.enumerate_children("*", Gio.FileQueryInfoFlags.NONE, null);
        let file = null;
        while((file = list.next_file(null)) != null) {
            let icon = Gio.file_new_for_path(GLib.get_user_data_dir() + "/icons/hicolor/" + size+ "/status/" + file.get_name());
            if(!icon.query_exists(null)) {
                icon.make_symbolic_link(Me.path + "/icons/" + size + "/" + file.get_name(), null);
                updateIconCache = true;
            }
        }

        if(updateIconCache) {
            Util.spawn(["gtk-update-icon-cache", "-f", "--ignore-theme-index", GLib.get_user_data_dir() + "/icons/hicolor"]);
        }
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
        if(answer == null) {
            this._skypeMenu.disable();
            this._setUserPresenceMenuIcon("OFFLINE");
        }
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
        this._skypeMenu = new SkypeMenuButton(this._proxy);
        Main.panel.addToStatusArea('skypeMenu', this._skypeMenu);
        this._authenticate();
        this._apiExtension.enable();
    },

    disable: function() {
        this._enabled = false;
        if(this._config != null) {
            this._config.toggle(this._enabled);
        }
        if(this._skypeMenu != null) {
            this._skypeMenu.destroy();
            this._skypeMenu = null;
        }
        this._apiExtension.disable();
    },

    updateSkypeStatus: function(presence) {
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
            if(item.title == "Skype") {
                if(item.initialTitle == "Skype") {
                    source = item;
                } else {
                    item.destroy();
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
        } else {
            notification = notifications[0];
            notification.update(summary, body);
        }
    },

    _setUserPresenceMenuIcon: function(presence) {
        if(presence == "ONLINE") {
            this._skypeMenu.setIcon("skype-presence-online");
        } else if(presence == "AWAY") {
            this._skypeMenu.setIcon("skype-presence-away");
        } else if(presence == "DND") {
            this._skypeMenu.setIcon("skype-presence-do-not-disturb");
        } else if(presence == "INVISIBLE") {
            this._skypeMenu.setIcon("skype-presence-invisible");
        } else if(presence == "OFFLINE") {
            this._skypeMenu.setIcon("skype-presence-offline");
        }
    },

    NotifyCallback: function(type, params) {
        this._notify(this._config.getNotification(type, params));
    },

    NotifyAsync: function(params) {
        if(!this._enabled) {
            return;
        }

        let [message] = params;
        if(message.indexOf("CURRENTUSERHANDLE ") !== -1) {
        	this._skypeMenu.enable();
            this._currentUserHandle = message.replace("CURRENTUSERHANDLE ", "");
            this._config = new SkypeConfig(this._currentUserHandle);
            this._config.toggle(this._enabled);
            this._authenticated = true;
        } else if(message.indexOf("USER ") !== -1) {
            let user = message.split(" ");
            if(user[1] == this._currentUserHandle && user[2] == "ONLINESTATUS") {
                this._setUserPresenceMenuIcon(user[3]);
            }
        } else if(message.indexOf("USERSTATUS ") !== -1) {
            this._setUserPresenceMenuIcon(message.split(" ")[1]);
        }
    }
});

// workaround for http://stackoverflow.com/questions/15237744/skype4py-messagestatuschanged-not-always-called
const SkypeAPIExtension = new Lang.Class({
    Name: "SkypeAPIExtension",

    _init: function(callback) {
         this._notify = callback;
         this._dbusImpl = Gio.DBusExportedObject.wrapJSObject(SkypeIfaceExtension, this);
         this._dbusImpl.export(Gio.DBus.session, "/com/Skype/Extension");
         this._dbusId = null;
    },

    enable: function() {
        this._dbusId = Gio.DBus.session.own_name('com.Skype.API.Extension',
                Gio.BusNameOwnerFlags.ALLOW_REPLACEMENT, null, null);
    },

    disable: function() {
        Gio.DBus.session.unown_name(this._dbusId);
    },

    Notify: function(type, sname, sskype, smessage, fpath, fsize, fname) {
        global.log("  type: "+ type);
        global.log("  sname: "+ sname);
        global.log("  sskype: "+ sskype);
        global.log("  smessage: "+ smessage);
        global.log("  fpath: "+ fpath);
        global.log("  fsize: "+ fsize);
        global.log("  fname: "+ fname);
        global.log("");
        global.log("");

        this._notify(type, { "contact": sname, "message": smessage,
            "filepath": fpath + "/" + fname, "filename": fname });
    }
});

const SkypeMenuButton = new Lang.Class({
    Name: "SkypeMenuButton",
    Extends: PanelMenu.SystemStatusButton,

    _init: function(proxy) {
        this.parent('skype-presence-offline', 'skypeMenu');
        this._proxy = proxy;
        this._enabled = false;
    },

    enable: function() {
        if(this.enabled) {
            return;
        }
        this.enabled = true;
        let changeStatusSection = new PopupMenu.PopupSubMenuMenuItem("Change Status");

        let changeStatusOnline = new PopupMenu.PopupMenuItem("Online");
        changeStatusOnline.connect('activate', Lang.bind(this, this._changeStatusOnline));
        changeStatusSection.menu.addMenuItem(changeStatusOnline);

        let changeStatusAway = new PopupMenu.PopupMenuItem("Away");
        changeStatusAway.connect('activate', Lang.bind(this, this._changeStatusAway));
        changeStatusSection.menu.addMenuItem(changeStatusAway);

        let changeStatusDnd = new PopupMenu.PopupMenuItem("Do Not Disturb");
        changeStatusDnd.connect('activate', Lang.bind(this, this._changeStatusDnd));
        changeStatusSection.menu.addMenuItem(changeStatusDnd);

        let changeStatusInvisible = new PopupMenu.PopupMenuItem("Invisible");
        changeStatusInvisible.connect('activate', Lang.bind(this, this._changeStatusInvisible));
        changeStatusSection.menu.addMenuItem(changeStatusInvisible);

        let changeStatusOffline = new PopupMenu.PopupMenuItem("Offline");
        changeStatusOffline.connect('activate', Lang.bind(this, this._changeStatusOffline));
        changeStatusSection.menu.addMenuItem(changeStatusOffline);

        let addContact = new PopupMenu.PopupMenuItem("Add a Contact");
        addContact.connect('activate', Lang.bind(this, this._openAddContact));

        let quit = new PopupMenu.PopupMenuItem("Quit");
        quit.connect('activate', Lang.bind(this, this._quit));

        this.menu.addMenuItem(changeStatusSection);
        this.menu.addMenuItem(addContact);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this.menu.addMenuItem(quit);
    },

    disable: function() {
        if(!this.enabled) {
            return;
        }
        this.enabled = false;
        this.menu.box.get_children().forEach(function(c) { c.destroy() });
    },

    _openAddContact: function() {
        if(this._proxy != null) {
            this._proxy.InvokeRemote("OPEN ADDAFRIEND");
        }
    },

    _changeStatusOnline: function() {
        if(this._proxy != null) {
            this._proxy.InvokeRemote("SET USERSTATUS ONLINE");
        }
    },

    _changeStatusAway: function() {
        if(this._proxy != null) {
            this._proxy.InvokeRemote("SET USERSTATUS NA");
        }
    },

    _changeStatusDnd: function() {
        if(this._proxy != null) {
            this._proxy.InvokeRemote("SET USERSTATUS DND");
        }
    },

    _changeStatusInvisible: function() {
        if(this._proxy != null) {
            this._proxy.InvokeRemote("SET USERSTATUS INVISIBLE");
        }
    },

    _changeStatusOffline: function() {
        if(this._proxy != null) {
            this._proxy.InvokeRemote("SET USERSTATUS OFFLINE");
        }
    },

    _quit: function() {
        Util.spawn(["killall", "skype"]);
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
                    "notification": [ "{contact}", "{message}", "skype" ]},
                "ChatIncoming": {
                    "enabled": false, "config": ["Chat", "ChatIncoming", 1],
                    "notification": [ "{contact}", "{message}", "skype" ]},
                "ChatOutgoing": {
                    "enabled": false, "config": ["ChatOutgoing", "ChatOutgoing", 0],
                    "notification": [ "{contact}", "{message}", "skype" ]},
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

        let script = this._get(xml, script, stag, "");
        script.data = [ 'python ' + Me.path + '/notify.py -e"%type" -n"%sname" -f"%fname" -p"%fpath" -m"%smessage" -s"%fsize" -u"%sskype"' ];
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
            this._options[key].enabled = this._set(params.concat(this._options[key].config));
        }
        this._options["ChatIncomingInitial"].enabled = true;

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
