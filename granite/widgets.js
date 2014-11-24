const Clutter = imports.gi.Clutter;
const Gtk = imports.gi.Gtk;
const Lang = imports.lang;
const Mainloop = imports.mainloop;
const PopupMenu = imports.ui.popupMenu;
const St = imports.gi.St;
const Signals = imports.signals;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Tooltips = Me.imports.tooltips;

const HintedEntry = new Lang.Class({
    Name: 'HintedEntry',

    _init: function(hintString) {

        this.actor = new St.Entry({
            style_class: 'entry'
        });

        this.hasClearIcon = false;

        this.actor.connect('secondary-icon-clicked', Lang.bind(this, function() {
            this.actor.text = '';
        }));

        this.actor.clutter_text.connect('text-changed', Lang.bind(this, function() {
            this.emit('changed');
        }));
        this.connect('changed', Lang.bind(this, this._manageIcon));

        this.actor.clutter_text.connect('activate', Lang.bind(this, function() {
            this.emit('activate');
        }));
    },

    _manageIcon: function() {
        if (this.hasClearIcon && this.actor.text != '') {
            let clearIcon = new St.Icon({
                icon_name: 'edit-clear-symbolic',
                icon_size: 16
            });
            this.actor.set_secondary_icon(clearIcon);
        } else {
            this.actor.set_secondary_icon(null);
        }
    },

    get hintString() {
        return this.actor.get_hint_text();
    },
    set hintString(value) {
        this.actor.set_hint_text(value);
    },

    grabFocus: function() {
        global.stage.set_key_focus(this.actor);
    },

    hasFocus: function() {
        return this.actor.clutter_text.has_key_focus();
    },

    destroy: function() {
        this.actor.destroy();
    }
});
Signals.addSignalMethods(HintedEntry.prototype);

const SearchBar = new Lang.Class({
    Name: 'SearchBar',
    Extends: HintedEntry,

    _init: function(hintString) {
        this.parent(hintString);

        this._timeoutId = 0;
        this.pauseDelay = 300;

        this.hasClearIcon = true;

        let searchIcon = new St.Icon({
            icon_name: 'edit-find-symbolic',
            icon_size: 16
        });
        this.actor.set_primary_icon(searchIcon);

        this.actor.clutter_text.connect_after('text-changed', Lang.bind(this, this._onChanged));
        this.actor.connect('primary-icon-clicked', Lang.bind(this, this._onIconRelease));

        this.actor.connect('key-press-event', Lang.bind(this, function(actor, event) {
            switch (event.get_key_symbol()) {
                case Clutter.Escape:
                    this.actor.text = '';
                    return true;
            }
            return false;
        }));
    },

    _onIconRelease: function() {
        this.emit('search-icon-release');
    },

    _onChanged: function() {
        if (this._timeoutId > 0) {
            Mainloop.source_remove(this._timeoutId);
            this._timeoutId = 0;
        }

        this._timeoutId = Mainloop.timeout_add(this.pauseDelay, Lang.bind(this, this._emitTextChanged));
    },

    _emitTextChanged: function() {
        let terms = this.actor.get_text();
        this.emit('text-changed-pause', terms);

        Mainloop.source_remove(this._timeoutId);
        this._timeoutId = 0;

        return true;
    }
});

const ModeButton = new Lang.Class({
    Name: 'ModeButton',

    _init: function() {

        this.actor = new St.BoxLayout({
            can_focus: false
        });

        this._selected = -1;
        this._itemMap = [];

        this.actor.add_style_class_name(Gtk.STYLE_CLASS_LINKED);
        this.actor.add_style_class_name('raised');
    },

    append: function(w, tooltip) {
        let index = this._itemMap.length;

        let item = new St.Button({
            can_focus: false,
            style_class: 'button',
            toggle_mode: true
        });
        item.add_actor(w);

        if (tooltip != null)
            new Tooltips.Tooltip(item, tooltip);

        item.connect('clicked', Lang.bind(this, function(actor) {
            this.setActive(index);
            return true;
        }));

        this._itemMap[index] = item;

        this.actor.add_actor(item);

        this.emit('mode-added', index, w);
    },

    setActive: function(newActiveIndex) {
        let newItem = this._itemMap[newActiveIndex];

        if (newItem != null) {
            newItem.set_checked(true);

            if (this._selected == newActiveIndex)
                return;

            // Unselect the previous item
            let oldItem = this._itemMap[this._selected];
            if (oldItem != null)
                oldItem.set_checked(false);

            this._selected = newActiveIndex;

            this.emit('mode-changed', newItem.get_child());
        }
    },

    remove: function(index) {
        let item = this._itemMap[index];

        if (item != null) {
            this._itemMap.splice(index, 1);
            this.emit('mode-removed', index, item.get_child());
            item.destroy();
        }
    },

    clearChildren: function() {
        this.getChildren().forEach(function(button) {
            button.hide();
            if (button.get_parent() != null)
                this.actor.remove_actor(button);
        }, this);

        this._itemMap = [];

        this._selected = -1;
    },

    destroy: function() {
        this.actor.destroy();
    },

    get selected() {
        return this._selected;
    },
    set selected(value) {
        this.setActive(value);
    },

    get nItems() {
        return this._itemMap.length;
    }
});
Signals.addSignalMethods(ModeButton.prototype);

const PopOver = new Lang.Class({
    Name: 'PopOver',
    Extends: PopupMenu.PopupMenu,

    _init: function(sourceActor, arrowAlignment, arrowSide) {
        this.parent(sourceActor, arrowAlignment, arrowSide);

        this.actor.add_style_class_name('popover_bg');
        this.box.add_style_class_name('popover');

        this.PADDINGS = {
            top: 0,
            right: 0,
            bottom: 0,
            left: 0
        }

        this.connect('parent-set', Lang.bind(this, this._calculatePaddings));
    },

    _calculatePaddings: function() {
        let themeNode = this.box.get_theme_node();

        this.PADDINGS.top = themeNode.get_padding(St.Side.TOP);
        this.PADDINGS.right = themeNode.get_padding(St.Side.RIGHT);
        this.PADDINGS.bottom = themeNode.get_padding(St.Side.BOTTOM);
        this.PADDINGS.left = themeNode.get_padding(St.Side.LEFT);
    }
});
