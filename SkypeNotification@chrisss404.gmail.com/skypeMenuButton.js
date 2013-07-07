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

const Util = imports.misc.util;

const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;


const SkypeMenuButton = new Lang.Class({
    Name: "SkypeMenuButton",
    Extends: PanelMenu.SystemStatusButton,

    _init: function(proxy) {
        this.parent("skype", "skypeMenu");
        this._proxy = proxy;

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

        this.menu.addMenuItem(addContact);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this.menu.addMenuItem(changeStatusSection);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this.menu.addMenuItem(quit);
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
