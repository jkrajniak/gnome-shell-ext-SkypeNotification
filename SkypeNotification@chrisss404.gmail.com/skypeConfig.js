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

const Gettext = imports.gettext;
const Lang = imports.lang;

const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;

const Me = imports.misc.extensionUtils.getCurrentExtension();

const SimpleXML = Me.imports.simpleXml.SimpleXML;

Gettext.textdomain(Me.uuid);
Gettext.bindtextdomain(Me.uuid, Me.path + "/locale");

const _ = Gettext.gettext;


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
                    "notification": [ "{contact}", _("Voicemail Received"), "emblem-shared" ]},
                "VoicemailSent": {
                    "enabled": false, "config": ["VoicemailSent", "VoicemailSent", 0],
                    "notification": [ _("Voicemail Sent"), "", "document-send" ]},
                "ContactOnline": {
                    "enabled": false, "config": ["Online", "ContactOnline", 1],
                    "notification": [ _("{contact} has appeared online"), "", "user-available" ]},
                "ContactOffline": {
                    "enabled": false, "config": ["Offline", "ContactOffline", 1],
                    "notification": [ _("{contact} has gone offline"), "", "user-offline" ]},
                "ContactAuthRequest": {
                    "enabled": false, "config": ["Authreq", "ContactAuthRequest", 1],
                    "notification": [ _("Contact request from {contact}"), "", "contact-new" ]},
                "ContactAdded": {
                    "enabled": false, "config": ["ContactAdded", "ContactAdded", 1],
                    "notification": [ _("{contact} has been added to your contact list"), "", "address-book-new" ]},
                "ContactDeleted": {
                    "enabled": false, "config": ["ContactDeleted", "ContactDeleted", 1],
                    "notification": [ _("{contact} has been deleted from your contact list"), "", "edit-delete" ]},
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
                    "notification": [ _("{contact} joined chat"), "{message}", "system-users" ]},
                "ChatParted": {
                    "enabled": false, "config": ["ChatParted", "ChatParted", 0],
                    "notification": [ _("{contact} left chat"), "{message}", "system-users" ]},
                "TransferRequest": {
                    "enabled": false, "config": ["TransferRequest", "TransferRequest", 1],
                    "notification": [ _("Incoming file from {contact}"), "", "gtk-save" ]},
                "TransferComplete": {
                	"enabled": false, "config": ["TransferComplete", "TransferComplete", 1],
                	"notification": [ _("Transfer Complete"), _("{filename} saved to {filepath}"), "gtk-save" ]},
                "TransferFailed": {
                    "enabled": false, "config": ["TransferFailed", "TransferFailed", 1],
                    "notification": [ _("Transfer Failed"), "{filename}", "gtk-close" ]},
                "SMSSent": {
                    "enabled": false, "config": ["SMSSent", "SMSSent", 1],
                    "notification": [ _("SMS Sent"), "", "document-send" ]},
                "SMSFailed": {
                    "enabled": false, "config": ["SMSFailed", "SMSFailed", 1],
                    "notification": [ _("SMS Failed"), "", "gtk-close" ]},
                "Birthday": {
                    "enabled": false, "config": ["Birthday", "Birthday", 1],
                    "notification": [ _("{contact} has a birthday tomorrow"), "", "appointment-soon" ]},
                "OurBirthday": {
                    "enabled": false, "config": ["OurBirthday", "OurBirthday", 1],
                    "notification": [ _("Happy Birthday {contact}"), "", "emblem-favorite" ]}
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
                notification.summary = this._unescapeHtml(notification.summary);
                notification.body = this._unescapeHtml(notification.body);
            }
            return notification;
        }
        return null;
    },

    _unescapeHtml: function(text) {
    	return text.replace(/&lt;/g, "<")
                   .replace(/&gt;/g, ">")
                   .replace(/&quot;/g, "\"")
                   .replace(/&apos;/g, "'")
                   .replace(/&amp;/g, "&");
    },

    _get: function(xml, root, name, value) {
        if(name.length == 0) {
            return {};
        }

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
        let stagElement = this._get(xml, enalbe, stag, preset);

        let active = (parseInt(ntagElement.data) == 1 || parseInt(stagElement.data) == 1);
        if(toggle) {
            if(active) {
                ntagElement.data = [0];
                stagElement.data = [1];
                return true;
            } else {
                stagElement.data = [0];
                return false;
            }
        } else {
            if(active) {
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
