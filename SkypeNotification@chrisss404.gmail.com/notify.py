#!/usr/bin/env python
# -*- coding: utf-8 -*-
#
# gnome-shell-extension-SkypeNotification
# Skype GnomeShell Integration.
#  
# This file is part of gnome-shell-extension-SkypeNotification.
#
# gnome-shell-ext-SkypeNotification is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# gnome-shell-ext-SkypeNotification  is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with gnome-shell-ext-SkypeNotification  If not, see <http://www.gnu.org/licenses/>.
#
 
import dbus
import sys
from optparse import OptionParser

for i in range(len(sys.argv)):
    if sys.argv[i] == "-n":
        sys.argv[i] = '-n"%sname"'
    if sys.argv[i] == "-u":
        sys.argv[i] = '-u"%sskype"'

parser = OptionParser()
parser.add_option("-e", "--event", dest="type", help="type of SKYPE_EVENT")
parser.add_option("-n", "--sname", dest="sname", help="display-name of contact")
parser.add_option("-u", "--skype", dest="sskype", help="skype-username of contact")
parser.add_option("-m", "--smessage", dest="smessage", help="message body")
parser.add_option("-p", "--path", dest="fpath", help="path to file")
parser.add_option("-s", "--size", dest="fsize", help="incoming file size")
parser.add_option("-f", "--filename", dest="fname", help="file name", metavar="FILE")
(o, args) = parser.parse_args()

bus = dbus.SessionBus()
server = bus.get_object('com.Skype.API.Extension', '/com/Skype/Extension')
server.Notify(o.type, o.sname, o.sskype, o.smessage, o.fpath, o.fsize, o.fname,
           dbus_interface = 'com.Skype.API.Extension')
