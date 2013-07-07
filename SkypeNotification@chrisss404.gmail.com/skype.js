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
const Tp = imports.gi.TelepathyGLib;

const Config = imports.misc.config;
const Me = imports.misc.extensionUtils.getCurrentExtension();

const Main = imports.ui.main;
const MessageTray = imports.ui.messageTray;

const SkypeConfig = Me.imports.skypeConfig.SkypeConfig;
const SkypeMenuButton = Me.imports.skypeMenuButton.SkypeMenuButton;
const SkypeSearchProvider = Me.imports.skypeSearchProvider.SkypeSearchProvider;


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


const Skype = new Lang.Class({
    Name: "Skype",

    _init: function() {
        this._enabled = false;
        this._authenticated = false;
        this._currentUserHandle = "";
        this._config = null;
        this._searchProvider = null;
        this._skypeMenu = null;
        this._apiExtension = new SkypeAPIExtension(Lang.bind(this, this.NotifyCallback));
        this._isGnome36 = (Config.PACKAGE_VERSION.indexOf("3.6") == 0);

        this._messages = [];
        this._closeTimer = null;
        this._notificationSource = 0;
        this._activeNotification = null;

        this._proxy = new SkypeProxy(Gio.DBus.session, "com.Skype.API", "/com/Skype");
        this._dbusImpl = Gio.DBusExportedObject.wrapJSObject(SkypeIfaceClient, this);
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
            if(this._skypeMenu != null) {
                this._skypeMenu.destroy();
                this._skypeMenu = null;
            }

            if(this._searchProvider != null) {
                Main.overview.removeSearchProvider(this._searchProvider);
                this._searchProvider = null;
            }
        }
        if(this._authenticated && answer == "ERROR 68") {
            this._authenticated = false;
            this._authenticate();
        }
        if(this._enabled) {
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2500, Lang.bind(this, this._heartBeat));
        }
    },

    enable: function() {
    	this._enabled = true;
        if(this._config != null) {
            this._config.toggle(this._enabled);
        }
        this._authenticate();
        this._heartBeat();
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
        if(this._searchProvider != null) {
            Main.overview.removeSearchProvider(this._searchProvider);
            this._searchProvider = null;
        }
        this._apiExtension.disable();
    },

    updateSkypeStatus: function(presence) {
        switch(presence) {
            case Tp.ConnectionPresenceType.BUSY:
                this._proxy.InvokeRemote("SET USERSTATUS DND");
                break;
            case Tp.ConnectionPresenceType.OFFLINE:
                this._proxy.InvokeRemote("SET USERSTATUS OFFLINE");
                break;
            case Tp.ConnectionPresenceType.HIDDEN:
                this._proxy.InvokeRemote("SET USERSTATUS INVISIBLE");
                break;
            case Tp.ConnectionPresenceType.AWAY:
                this._proxy.InvokeRemote("SET USERSTATUS AWAY");
                break;
            case Tp.ConnectionPresenceType.AVAILABLE:
            default:
                this._proxy.InvokeRemote("SET USERSTATUS ONLINE");
        }
    },

    _updateNotifySource: function() {
        let source = null;
        let items = null;

        if(this._isGnome36) {
            items = Main.messageTray.getSummaryItems();
        } else {
            items = Main.messageTray.getSources();
        }

        let item = null;
        let numberOfNotifications = -1;
        for(let index in items) {
            if(this._isGnome36) {
                item = items[index].source;
            } else {
                item = items[index];
            }
            if(item.title == "Skype") {
                if(item.count > numberOfNotifications) {
                    source = item;
                    numberOfNotifications = item.count;
                }
            }
        }

        if(source == null) {
            this._notificationSource++;
        } else {
            this._notificationSource = source;
        }
    },

    _onClose: function() {
        this._messages = [];

        if(this._activeNotification != null && !Main.messageTray._trayHovered) {
            this._activeNotification.emit("destroy", MessageTray.NotificationDestroyedReason.EXPIRED);
            this._activeNotification = null;
        }
    },

    _pushMessage: function(message) {
        if(message == null) {
            return;
        }
        this._messages.push(message);

        if(this._closeTimer != null) {
            GLib.source_remove(this._closeTimer);
            this._closeTimer = null;
        }
        this._closeTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 10000, Lang.bind(this, this._onClose));
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, Lang.bind(this, this._notify));
    },

    _notify: function() {
        this._updateNotifySource();
        if(typeof this._notificationSource !== "object") {
            if(this._notificationSource < 10) {
                GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, Lang.bind(this, this._notify));
            } else {
                this._notificationSource = 0;
            }
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

        let params = {};
        if(!this._isGnome36) {
            params["gicon"] = Gio.icon_new_for_string(icon);
        }

        if(this._notificationSource.count == 0) {
            this._activeNotification = new MessageTray.Notification(this._notificationSource, 
                    summary, body, params);
            this._activeNotification.setUrgency(MessageTray.Urgency.HIGH);
            this._notificationSource.notify(this._activeNotification);
        } else {
            this._activeNotification = this._notificationSource.notifications[0];
            this._activeNotification.setTransient(true);
            this._activeNotification.setUrgency(MessageTray.Urgency.HIGH);
            this._activeNotification.update(summary, body, params);
        }
    },

    _getContacts: function() {
        let results = []
        let [contacts] = this._proxy.InvokeSync("SEARCH FRIENDS");

        if(contacts.indexOf("USERS ") !== -1) {
            contacts = contacts.replace("USERS ", "").split(",");
            for(let contact in contacts) {
                let userName = this._getUserName(contacts[contact]);
                let item = { "handle": contacts[contact], "name": userName };
                results.push(item);
            }
        }
        return results;
    },

    _getUserName: function(userHandle) {
        userHandle = userHandle.trim();

        let [displayName] = this._proxy.InvokeSync("GET USER %s DISPLAYNAME".format(userHandle));
        displayName = displayName.replace("USER %s DISPLAYNAME ".format(userHandle), "");
        if(displayName != "") {
            return displayName;
        }

        let [userName] = this._proxy.InvokeSync("GET USER %s FULLNAME".format(userHandle));
        userName = userName.replace("USER %s FULLNAME ".format(userHandle), "");
        if(userName != "") {
            return userName;
        }
        return userHandle;
    },

    _setUserPresenceMenuIcon: function(presence) {
        if(presence == "ONLINE") {
            this._skypeMenu.setGIcon(Gio.icon_new_for_string(Me.path + "/icons/16x16/skype-presence-online.png"));
        } else if(presence == "AWAY") {
            this._skypeMenu.setGIcon(Gio.icon_new_for_string(Me.path + "/icons/16x16/skype-presence-away.png"));
        } else if(presence == "DND") {
            this._skypeMenu.setGIcon(Gio.icon_new_for_string(Me.path + "/icons/16x16/skype-presence-do-not-disturb.png"));
        } else if(presence == "INVISIBLE") {
            this._skypeMenu.setGIcon(Gio.icon_new_for_string(Me.path + "/icons/16x16/skype-presence-invisible.png"));
        } else if(presence == "OFFLINE") {
            this._skypeMenu.setGIcon(Gio.icon_new_for_string(Me.path + "/icons/16x16/skype-presence-offline.png"));
        }
    },

    NotifyCallback: function(type, params) {
        this._pushMessage(this._config.getNotification(type, params));
    },

    NotifyAsync: function(params) {
        if(!this._enabled) {
            return;
        }

        let [message] = params;
        if(message.indexOf("CURRENTUSERHANDLE ") !== -1) {
            this._authenticated = true;
            let userHandle = message.replace("CURRENTUSERHANDLE ", "");
            if(this._currentUserHandle != userHandle) {
                this._currentUserHandle = userHandle;
                this._config = new SkypeConfig(this._currentUserHandle);
                this._config.toggle(this._enabled);
            }

            if(this._skypeMenu == null) {
                this._skypeMenu = new SkypeMenuButton(this._proxy);
                Main.panel.addToStatusArea("skypeMenu", this._skypeMenu);
            }

            if(this._searchProvider == null) {
                this._searchProvider = new SkypeSearchProvider("SKYPE", this._proxy);
                Main.overview.addSearchProvider(this._searchProvider);
            }
            this._searchProvider.setContacts(this._getContacts());
        } else if(message.indexOf("USER ") !== -1) {
            let user = message.split(" ");
            if(user[2] == "ONLINESTATUS" && user[1] == this._currentUserHandle) {
                this._setUserPresenceMenuIcon(user[3]);
            } else if(user[2] == "BUDDYSTATUS") {
                this._searchProvider.setContacts(this._getContacts());
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
        this._notify(type, { "contact": sname, "message": smessage,
            "filepath": fpath + "/" + fname, "filename": fname });
    }
});
