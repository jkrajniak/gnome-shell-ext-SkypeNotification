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
const Tp = imports.gi.TelepathyGLib;

const Config = imports.misc.config;
const Me = imports.misc.extensionUtils.getCurrentExtension();
const Util = imports.misc.util;

const IconGrid = imports.ui.iconGrid;
const IMStatusChooserItem = imports.ui.userMenu.IMStatusChooserItem;
const Main = imports.ui.main;
const MessageTray = imports.ui.messageTray;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const Search = imports.ui.search;

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
        this._isGnome38 = (Config.PACKAGE_VERSION.indexOf("3.8") == 0);

        this._enableIcons("16x16");
        this._enableIcons("32x32");

        this._messages = [];

        this._proxy = new SkypeProxy(Gio.DBus.session, "com.Skype.API", "/com/Skype");
        this._dbusImpl = Gio.DBusExportedObject.wrapJSObject(SkypeIfaceClient, this);
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
        if(this._enabled) {
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2500, Lang.bind(this, this._heartBeat));
        }
    },

    enable: function() {
        if(this._config != null) {
            this._config.toggle(this._enabled);
        }
        if(this._skypeMenu == null) {
            this._skypeMenu = new SkypeMenuButton(this._proxy);
            Main.panel.addToStatusArea('skypeMenu', this._skypeMenu);
        }
        if(this._searchProvider == null) {
            this._searchProvider = new SkypeSearchProvider("SKYPE", this._proxy);
            Main.overview.addSearchProvider(this._searchProvider);
        }
        if(!this._enabled) {
            this._authenticate();
            this._heartBeat();
            this._apiExtension.enable();
            this._enabled = true;        	
        }
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
            case Tp.ConnectionPresenceType.AVAILABLE:
            default:
                this._proxy.InvokeRemote("SET USERSTATUS ONLINE");
        }
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
        let numberOfNotifications = -1;
        for(let index in items) {
            if(this._isGnome38) {
                item = items[index];
            } else {
                item = items[index].source;
            }
            if(item.title == "Skype") {
                if(item.count > numberOfNotifications) {
                    source = item;
                    numberOfNotifications = item.count;
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
        for(let i in notifications) {
            notifications[i].destroy();
        }

        let notification = new MessageTray.Notification(source, summary, body);
        notification.setTransient(true);
        notification.connect("collapsed", Lang.bind(this, this._onClose));
        source.notify(notification);
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
            let userHandle = message.replace("CURRENTUSERHANDLE ", "");
            if(this._currentUserHandle != userHandle) {
                this._currentUserHandle = userHandle;
                this._config = new SkypeConfig(this._currentUserHandle);
                GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, Lang.bind(this, this.enable));
            }
            this._authenticated = true;
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

const SkypeSearchProvider = new Lang.Class({
    Name: 'SkypeSearchProvider',
    Extends: Search.SearchProvider,

    _init: function(title, proxy) {
        this.title = title;

        this._proxy = proxy;
        this._contacts = [];
        this._contactsSubsearch = [];
    },

    setContacts: function(contacts) {
        this._contacts = contacts;
    },

    getResultMetas: function(result, callback) {
        let metas = [];
        for (let i in result) {
            metas.push({ 'id': i,
                         'name': result[i].name,
                         'handle': result[i].handle
                       });
        }
        callback(metas);
    },

    _search: function(haystack, needles) {
        let result = [];

        let handle = "";
        let name = "";
        let needle = "";

        for(let index in needles) {
            needle = needles[index].toLowerCase();
            for(let i in haystack) {
                handle = haystack[i].handle.trim().toLowerCase();
                name = haystack[i].name.trim().toLowerCase();
                if(handle.indexOf(needle) === 0 || name.indexOf(needle) === 0) {
                    result.push(haystack[i]);
                }
            }
        }
        result.sort(function(a, b) {
                return (a.name < b.name ? -1 : (a.name > b.name ? 1 : 0));
            });

        this.searchSystem.pushResults(this, result);
        this._contactsSubsearch = result;
    },

    getInitialResultSet: function(terms) {
        this._search(this._contacts, terms);
    },

    getSubsearchResultSet: function(previousResults, terms) {
        this._search(this._contactsSubsearch, terms);
    },

    createResultActor: function (resultMeta, terms) {
        let actor = new St.Button({ style_class: 'app-well-app app-folder',
            button_mask: St.ButtonMask.ONE,
            toggle_mode: true,
            can_focus: true,
            x_fill: true,
            y_fill: true });

        let icon = new IconGrid.BaseIcon(resultMeta["name"],
                 { createIcon: Lang.bind(this, this._createIcon) });
        actor.set_child(icon.actor);
        actor.label_actor = icon.label;
        actor.handle = resultMeta["handle"];
        actor.connect('clicked', Lang.bind(this, this.activateResult));

        return actor;
    },

    _createIcon: function(size) {
        return new St.Icon({ icon_name: 'skype',
            icon_size: 64,
            style_class: 'app-well-app',
            track_hover: true });
    },

    activateResult: function(event) {
        if(typeof event.handle === "string") {
            this._proxy.InvokeRemote("OPEN IM " + event.handle);
            Main.overview.hide();
        } else {
            this._proxy.InvokeRemote("OPEN IM " + this._contactsSubsearch[event].handle);
        }
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
