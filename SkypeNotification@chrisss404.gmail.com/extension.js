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

const Gio = imports.gi.Gio;
const IMStatusChooserItem = imports.ui.userMenu.IMStatusChooserItem;
const Lang = imports.lang;
const Main = imports.ui.main;
const MessageTray = imports.ui.messageTray;


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

        this._proxy = new SkypeProxy(Gio.DBus.session, "com.Skype.API", "/com/Skype");
        this._proxy.InvokeRemote("NAME SkypeNotification");
        this._proxy.InvokeRemote("PROTOCOL 7");

        this._dbusImpl = Gio.DBusExportedObject.wrapJSObject(SkypeIfaceClient, this);
        this._dbusImpl.export(Gio.DBus.session, "/com/Skype/Client");
    },

    enable: function() {
        this._enabled = true;
    },

    disable: function() {
        this._enabled = false;
    },

    updateSkypeStatus: function(presence) {
        global.log("presence: " + presence);
        switch(presence) {
            case SkypeStatus.DND:
                this._proxy.InvokeRemote('SET USERSTATUS DND');
                break;
            case SkypeStatus.OFFLINE:
                this._proxy.InvokeRemote('SET USERSTATUS OFFLINE');
                break;
            case SkypeStatus.ONLINE:
            default:
                this._proxy.InvokeRemote('SET USERSTATUS ONLINE');
        }
    },

    _retrieve: function(request) {
        let [response] = this._proxy.InvokeSync(request);
        let parts = response.split(" ");
        parts.splice(0, 3);
        return parts.join(" ");
    },

    _getNotifySource: function() {
    	let source = null;

        // getSources() in gs3.8
        let items = Main.messageTray.getSummaryItems();
        let item = null; 
        for(let index in items) {
        	item = items[index].source;
            if(item.title == "Skype") {
            	if(item.initialTitle == "Skype") {
            		source = item;
            	} else {
            		for(let notification in item.notifications) {
            			item.notifications[notification].destroy();
            		}
            	}
            }
        }

    	return source;
    },

    _notify: function(title, banner) {
        let source = this._getNotifySource();
        if(source == null) {
        	global.log("Is Skype running?");
        	return;
        }

        let notifications = source.notifications;
        let notification = null;

        if(source.count == 0) {
        	notification = new MessageTray.Notification(source, title, banner);
        	notification.setTransient(true);
        	source.notify(notification);
        } else {
        	notification = notifications[0];
        	notification.setTransient(true);
        	notification.update(title, banner);
        	notification.updated();
        }
    },

    NotifyAsync: function(params) {
        if(!this._enabled) {
            return;
        }

        let [message] = params;
        global.log(message);

        if(message.indexOf("CHATMESSAGE") !== -1) {
            let messageId = message.split(" ")[1];

            let messageBody = this._retrieve("GET CHATMESSAGE " + messageId + " BODY");
            let userHandle = this._retrieve("GET CHATMESSAGE " + messageId + " FROM_HANDLE");
            let userName = this._retrieve("GET USER " + userHandle + " FULLNAME");

            global.log(userName);
            global.log(messageBody);
            
            this._notify(userName, messageBody);
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
    global.log("enabled");
}

function disable() {
    skype.disable();

    if(typeof IMStatusChooserItem.prototype._setComboboxPresenceOrig === 'function') {
        IMStatusChooserItem.prototype._setComboboxPresence = IMStatusChooserItem.prototype._setComboboxPresenceOrig;
        IMStatusChooserItem.prototype._setComboboxPresenceOrig = undefined;
    }
    global.log("disabled");
}
