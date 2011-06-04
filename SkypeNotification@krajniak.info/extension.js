/*
 * Skype GnomeShell Integration.
 *
 * Credits to the author of Gajim extension as this extension code was modified
 * from it and author of Skype extension
 * 
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
    },
    
    _state: "",
    setState: function(state, err){
	this._state = state.replace('USERSTATUS ','');
	global.log(err);
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
                        this._proxy.InvokeRemote('SET USERSTATUS AWAY');
                } else if (status == GnomeSession.PresenceStatus.AWAY) {
                        this._proxy.InvokeRemote('SET USERSTATUS NA');
                } else if (status != GnomeSession.PresenceStatus.IDLE) {
                        this._proxy.InvokeRemote('SET USERSTATUS ONLINE');       
                }
        }
    }
}


function main(metadata) {
    let client = new SkypeClient();   
}
