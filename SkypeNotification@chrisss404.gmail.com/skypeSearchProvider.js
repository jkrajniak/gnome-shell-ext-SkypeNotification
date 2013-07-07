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

const St = imports.gi.St

const IconGrid = imports.ui.iconGrid;
const Main = imports.ui.main;
const Search = imports.ui.search;


const SkypeSearchProvider = new Lang.Class({
    Name: "SkypeSearchProvider",
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
            metas.push({ "id": i,
                         "name": result[i].name,
                         "handle": result[i].handle
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
        this._search(previousResults, terms);
    },

    createResultActor: function (resultMeta, terms) {
        let actor = new St.Button({ style_class: "app-well-app app-folder",
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
        actor.connect("clicked", Lang.bind(this, this.activateResult));

        return actor;
    },

    _createIcon: function(size) {
        return new St.Icon({ icon_name: "skype",
            icon_size: 64,
            style_class: "app-well-app",
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
