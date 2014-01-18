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

const Config = imports.misc.config;
const Me = imports.misc.extensionUtils.getCurrentExtension();

let hastStatusChooser = (Config.PACKAGE_VERSION.indexOf("3.6") == 0 || Config.PACKAGE_VERSION.indexOf("3.8") == 0);
if(hastStatusChooser) {
    const IMStatusChooserItem = imports.ui.userMenu.IMStatusChooserItem;
} else {
    const MessageTrayMenuButton = imports.ui.messageTray.MessageTrayMenuButton;
}

const Skype = Me.imports.skype.Skype;


let skype = null;
function init() {
    imports.gettext.bindtextdomain(Me.uuid, Me.path + "/locale");
    skype = new Skype();
}

function enable() {
    skype.enable();

    if(hastStatusChooser) {
        IMStatusChooserItem.prototype._setComboboxPresenceOrig = IMStatusChooserItem.prototype._setComboboxPresence;
        IMStatusChooserItem.prototype._setComboboxPresence = function(presence) {
            this._setComboboxPresenceOrig(presence);
            skype.updateSkypeStatus(presence);
        };
    } else {
        MessageTrayMenuButton.prototype._iconForPresenceOrig = MessageTrayMenuButton.prototype._iconForPresence;
        MessageTrayMenuButton.prototype._iconForPresence = function(presence) {
            this._iconForPresenceOrig(presence);
            skype.updateSkypeStatus(presence);
        };
    }
}

function disable() {
    skype.disable();

    if(hastStatusChooser) {
        if(typeof IMStatusChooserItem.prototype._setComboboxPresenceOrig === "function") {
            IMStatusChooserItem.prototype._setComboboxPresence = IMStatusChooserItem.prototype._setComboboxPresenceOrig;
            IMStatusChooserItem.prototype._setComboboxPresenceOrig = undefined;
        }
    } else {
        if(typeof MessageTrayMenuButton.prototype._iconForPresenceOrig === "function") {
            MessageTrayMenuButton.prototype._iconForPresence = MessageTrayMenuButton.prototype._iconForPresenceOrig;
            MessageTrayMenuButton.prototype._iconForPresenceOrig = undefined;
        }
    }
}
