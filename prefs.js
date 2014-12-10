const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const Gio = imports.gi.Gio;
const Gtk = imports.gi.Gtk;

const Gettext = imports.gettext.domain('gnome-shell-extension-slingshot');
const _ = Gettext.gettext;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;

function init() {
    Convenience.initTranslations();
}

const SlingshotPrefsWidget = new GObject.Class({
    Name: 'Slingshot.Prefs.Widget',
    GTypeName: 'SlingshotPrefsWidget',
    Extends: Gtk.Box,

    _init: function(params) {
        this.parent(params);
        this.margin = 12;
        this.set_orientation(Gtk.Orientation.VERTICAL);

        this._settings = Convenience.getSettings();

        this.addOption({
            type: 'spinbutton',
            name: 'columns',
            label: _('Columns'),
            tooltip: _('The default number of columns'),
            min: 4,
            max: 10
        });

        this.addOption({
            type: 'spinbutton',
            name: 'rows',
            label: _('Rows'),
            tooltip: _('The default number of rows'),
            min: 2,
            max: 10
        });

        this.addOption({
            type: 'switch',
            name: 'show-category-filter',
            label: _('Show Category Filter'),
            tooltip: _('Show the category switcher or not')
        });
    },

    addOption: function(args) {

        args = args || {};

        if (!args.name || !args.type)
            return;

        let box = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            margin_top: 5
        });

        if (args.label) {
            let label = new Gtk.Label({
                label: args.label,
                xalign: 0
            });

            if (args.tooltip)
                label.set_tooltip_text(args.tooltip);

            box.pack_start(label, true, true, 0);
        }

        let control;

        switch (args.type) {
            case 'spinbutton':
                control = new Gtk.SpinButton({
                    adjustment: new Gtk.Adjustment({
                        lower: args.min || 0,
                        upper: args.max || 0,
                        step_increment: args.increment || 1
                    }),
                    snap_to_ticks: true
                });
                this._settings.bind(args.name, control, 'value', Gio.SettingsBindFlags.DEFAULT);
                break;

            case 'switch':
                control = new Gtk.Switch();
                this._settings.bind(args.name, control, 'active', Gio.SettingsBindFlags.DEFAULT);
                break;
        }

        if (args.tooltip)
            control.set_tooltip_text(args.tooltip);

        box.add(control);

        this.add(box);
    }
});

function buildPrefsWidget() {
    let widget = new SlingshotPrefsWidget();
    widget.show_all();

    return widget;
}
