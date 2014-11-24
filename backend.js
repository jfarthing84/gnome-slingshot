const GMenu = imports.gi.GMenu;
const Lang = imports.lang;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Signals = imports.signals;

const App = new Lang.Class({
    Name: 'App',

    _init: function(app) {

        if (app instanceof GMenu.TreeEntry) {
            this._fromEntry(app);
        } else {
            this._fromCommand(app);
        }
    },

    _fromEntry: function(entry) {

        let info = entry.get_app_info();

        this.name = info.get_display_name();
        this.description = info.get_description() || this.name;
        this.exec = info.get_commandline();
        this.desktopId = entry.get_desktop_file_id();
        this.desktopPath = entry.get_desktop_file_path();
        this.genericName = info.get_generic_name() || '';
        this.icon = info.get_icon();
    },

    _fromCommand: function(command) {

        this.name = command;
        this.description = _('Run this command...');
        this.exec = command;
        this.desktopId = command;
        this.icon = new Gio.ThemedIcon({ name: 'system-run' });

        this._isCommand = true;
    },

    launch: function() {
        try {
            if (this._isCommand) {
                global.log('Launching command: ' + this.name);
                GLib.spawn_command_line_async(this.exec);
            } else {
                this.emit('launched', this);
                Gio.DesktopAppInfo.new(this.desktopId).launch([], null);
                global.log('Launching application: ' + this.name);
            }
        } catch (e) {
            global.log(e);
        }
    }
});
Signals.addSignalMethods(App.prototype);

const AppSystem = new Lang.Class({
    Name: 'AppSystem',

    _init: function() {

        this._categories = null;
        this._apps = null;

        this._appsMenu = new GMenu.Tree({
            menu_basename: 'applications.menu',
            //flags: GMenu.TreeFlags.INCLUDE_EXCLUDED
        });
        this._appsMenuChangedId = this._appsMenu.connect('changed', Lang.bind(this, this._updateAppSystem));

        this._updateAppSystem();
    },

    _updateAppSystem: function() {

        this._appsMenu.load_sync();

        this._updateCategoriesIndex();
        this._updateApps();

        this.emit('changed');
    },

    _updateCategoriesIndex: function() {

        global.log('Updating categories...');

        this._categories = [];

        let iter = this._appsMenu.get_root_directory().iter();
        let type;

        while ((type = iter.next()) != GMenu.TreeItemType.INVALID) {
            if (type == GMenu.TreeItemType.DIRECTORY) {
                let dir = iter.get_directory();
                if (!dir.get_is_nodisplay())
                    this._categories.push(dir);
            }
        }
    },

    _updateApps: function() {

        global.log('Updating apps...');

        this._apps = {};

        this._categories.forEach(function(cat, index) {
            this._apps[cat.get_name()] = this.getAppsByCategory(cat);
        }, this);
    },

    getCategories: function() {
        return this._categories;
    },

    getAppsByCategory: function(category) {

        let appList = [];

        let iter = category.iter();
        let type;

        while ((type = iter.next()) != GMenu.TreeItemType.INVALID) {
            switch (type) {
                case GMenu.TreeItemType.DIRECTORY:
                    appList.concat(this.getAppsByCategory(iter.get_directory()));
                    break;
                case GMenu.TreeItemType.ENTRY:
                    let app = new App(iter.get_entry());
                    appList.push(app);
                    break;
            }
        }
        return appList;
    },

    getApps: function() {
        return this._apps;
    },

    getAppsByName: function() {

        let sortedAppList = [];
        let sortedAppExecs = [];

        for (let category in this._apps) {
            let apps = this._apps[category];
            apps.forEach(function(app) {
                if (sortedAppExecs.indexOf(app.exec) == -1) {
                    sortedAppList.push(app);
                    sortedAppExecs.push(app.exec);
                }
            });
        }

        sortedAppList.sort(function(a, b) {
            return a.name.toLowerCase() > b.name.toLowerCase();
        });

        return sortedAppList;
    },

    searchResults: function(search) {

        global.log('Searching for "' + search + '"');

        let filtered = [];

        for (let category in this._apps) {
            this._apps[category].forEach(function(app) {
                if (app.name.toLowerCase().indexOf(search) != -1) {
                    if (search == app.name.toLowerCase().slice(0, search.length))
                        app.relevancy = 0.5;
                    else
                        app.relevancy = app.name.length / search.length;
                    filtered.push(app);
                } else if (app.exec.toLowerCase().indexOf(search) != -1) {
                    app.relevancy = app.exec.length / search.length * 10.0;
                    filtered.push(app);
                } else if (app.description.toLowerCase().indexOf(search) != -1) {
                    app.relevancy = app.description.length / search.length;
                    filtered.push(app);
                } else if (app.genericName.toLowerCase().indexOf(search) != -1) {
                    app.relevancy = app.genericName.length / search.length;
                    filtered.push(app);
                }
            });
        }

        filtered.sort(function(a, b) {
            return (a.relevancy * 1000 - b.relevancy * 1000);
        });

        global.log('Found ' + filtered.length + ' apps');

        if (filtered.length > 20) {
            return filtered.slice(0, 20);
        } else {
            return filtered;
        }
    },

    destroy: function() {
        this._appsMenu.disconnect(this._appsMenuChangedId);
    }
});
Signals.addSignalMethods(AppSystem.prototype);
