/*
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
 * Credits to the author of Gajim extension as this extension code was modified
 * from it.
 * 
 * Copyright (C) 2011
 * Author: Jakub Krajniak <jkrajniak@gmail.com>
 * 
 */

const DBus = imports.dbus;
const GnomeSession = imports.misc.gnomeSession;
const Lang = imports.lang;


const SkypeIface = {
    name: 'com.Skype.API',
    methods: [
        { name: 'Invoke', inSignature: 's', outSignature: 's' },
        { name: 'Notify', inSignature: 's', outSignature: 's' }
    ],
    signals: [
        { name: 'Notify', inSignature: 's' }
    ]
};

let Skype = DBus.makeProxyClass(SkypeIface);

function SkypeClient() {
    this._init();
}

SkypeClient.prototype = {
    _init: function() {
        this._sources = {};
        this._proxy = new Skype(DBus.session, 'com.Skype.API', '/com/Skype');
        this._gnomeSessionPresence = new GnomeSession.Presence();
        this._gnomeSessionPresence.connect('StatusChanged', Lang.bind(this, this._onStatusChanged));
        this._proxy.InvokeRemote('NAME SkypeNotification');
        this._proxy.InvokeRemote('PROTOCOL 5');
        this._proxy.InvokeRemote("GET USERSTATUS", Lang.bind(this, this.setState));  
        
        /** bind for Skype notifications */
        //this._proxyClient = new Skype(DBus.session, 'com.Skype.API', '/com/Skype/Client');
    },
    
    _state: "",
    
    setState: function(state, err){
    	this._state = state.replace('USERSTATUS ','');
    },
	
    getState: function() {
	    return this._state;
    },
    
    _onStatusChanged: function(presence, status)  {
        this._proxy.InvokeRemote('NAME SkypeNotification');
        this._proxy.InvokeRemote('PROTOCOL 5');

        this._proxy.InvokeRemote("GET USERSTATUS", Lang.bind(this, this.setState));
        
        if ( this._state != "OFFLINE" && this._state != "INVISIBLE") {
                if (status == GnomeSession.PresenceStatus.BUSY) {
                        this._proxy.InvokeRemote('SET USERSTATUS DND');
                        global.log('SET DND');
                } else if (status == GnomeSession.PresenceStatus.IDLE) {
                        this._proxy.InvokeRemote('SET USERSTATUS NA');
                        global.log('SET NA');
                } else if (status == GnomeSession.PresenceStatus.AVAILABLE) {
                        this._proxy.InvokeRemote('SET USERSTATUS ONLINE');
                        global.log('SET ONLINE');
                } else if (status == GnomeSession.PresenceStatus.INVISIBLE) {
                        this._proxy.InvokeRemote('SET USERSTATUS INVISIBLE');
                        global.log('SET INVISIBLE');
                }
        }
    }
}


function main(metadata) {
    let client = new SkypeClient();
}
