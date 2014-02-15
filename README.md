## GNOME Shell Skype Integration

This extension simplifies the life for Microsoft Skype users. It makes use of the [Skype API](https://github.com/chrisss404/gnome-shell-ext-SkypeNotification/raw/master/docs/Skype%20Developer%20-%20Skype%20Desktop%20API%20Reference%20Manual.pdf), which is unfortunately no longer supported, but still works with Skype version 4.2.0.11.

#### Integrated features:

- display online presence in top bar icon
- add an indicator to the top bar icon for missed chat messages and calls
- use GNOME Shell notification style for Skype notifications
- show a list of recent chats with an activity indicator in the top bar menu
- ability to change online presence in the top bar menu
- mute microphone during calls within the top bar menu
- search provider to find Skype contacts


### Installation

At the moment there are 2 possibilities:

- Visit the [Skype Integration page](https://extensions.gnome.org/extension/696/skype-integration/) on extensions.gnome.org, click on the switch ("OFF" => "ON"), click on the install button.
- Or, download the source from [here](https://github.com/chrisss404/gnome-shell-ext-SkypeNotification/archive/master.zip), extract it to `~/.local/share/gnome-shell/extensions/`, restart GNOME Shell (`Alt`+`F2`, `r`, `Enter`) and enable the extension through *gnome-tweak-tool*.

#### Dependencies:
    
    D-Bus Python Bindings
        on Ubuntu: python-dbus
        on Fedora: dbus-python

----

### FAQs

#### How can I enable and disable individual notifications?

Go to Options > Notifications and click on `Advanced View`. If the option `Execute the following script` is checked, the notification is enabled otherwise it is disabled ([initial question](https://github.com/chrisss404/gnome-shell-ext-SkypeNotification/issues/9)). [Here](https://github.com/chrisss404/gnome-shell-ext-SkypeNotification/blob/master/SkypeNotification%40chrisss404.gmail.com/skypeConfig.js#L45) is a list of all supported notifications.


#### Can't install anymore after recent update, what shall I do?

Completely remove the extension by executing (`rm -rf ~/.local/share/gnome-shell/extensions/SkypeNotification@chrisss404.gmail.com`), restart GNOME Shell (`Alt`+`F2`, `r`, `Enter`) and reinstall it ([initial question](https://github.com/chrisss404/gnome-shell-ext-SkypeNotification/issues/17)).

----

### Screenshots

![Screenshot](https://raw.github.com/chrisss404/gnome-shell-ext-SkypeNotification/master/data/screenshot1.jpg)
![Screenshot](https://raw.github.com/chrisss404/gnome-shell-ext-SkypeNotification/master/data/screenshot2.jpg)

----

Inspired by

- https://github.com/MrTheodor/gnome-shell-ext-SkypeNotification
- https://gist.github.com/nzjrs/1006316
- https://extensions.gnome.org/extension/166/skype-contact-search/

Credits to

- https://github.com/whhglyphs/webhostinghub-glyphs/ (thanks keynslug for telling me about this awesome icons)

