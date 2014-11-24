const Clutter = imports.gi.Clutter;
const Lang = imports.lang;
const Mainloop = imports.mainloop;
const Pango = imports.gi.Pango;
const GLib = imports.gi.GLib;
const Signals = imports.signals;
const St = imports.gi.St;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Backend = Me.imports.backend;
const Granite = Me.imports.granite;
const Tooltips = Me.imports.tooltips;
const Widgets = Me.imports.widgets;

const AppEntry = new Lang.Class({
    Name: 'AppEntry',

    _init: function(app, iconSize) {

        this._appplication = app;
        this.appName = app.name;
        this.execName = app.exec;
        this.iconSize = iconSize || 64;
        this.icon = app.icon;

        this.actor = new St.Button({
            style_class: 'button app',
            x_fill: true,
            y_fill: true
        });
        this.actor.set_size(130, 130);
        this.actor._delegate = this;

        let layout = new St.BoxLayout({
            margin_top: 5,
            margin_right: 5,
            margin_bottom: 5,
            margin_left: 5,
            vertical: true
        });

        let appIcon = new St.Icon({
            icon_size: this.iconSize,
            gicon: this.icon
        });
        layout.add_actor(appIcon);

        let appLabel = new St.Label({
            text: this.appName,
            margin_top: 9,
            style: 'text-align: center',
            x_align: Clutter.ActorAlign.CENTER
        });
        appLabel.clutter_text.set_line_wrap(true);
        appLabel.clutter_text.set_single_line_mode(false);
        appLabel.clutter_text.set_line_alignment(Pango.Alignment.CENTER);
        appLabel.clutter_text.set_ellipsize(Pango.EllipsizeMode.END);
        layout.add_actor(appLabel);

        let appTooltip = new Tooltips.Tooltip(this.actor, app.description);

        this.actor.add_actor(layout);

        this.actor.connect('clicked', Lang.bind(this, this.launchApp));
    },

    launchApp: function() {
        this._appplication.launch();
        this.emit('app-launched');
    },

    destroy: function() {
        this.actor.destroy();
    }
});
Signals.addSignalMethods(AppEntry.prototype);

const CategoryView = new Lang.Class({
    Name: 'CategoryView',

    _init: function(parent) {

        this._view = parent;

        this._currentPosition = 0;
        this._fromCategory = false;
        this.categoryIds = [];

        this.actor = new St.BoxLayout();
        this.actor.set_size(this._view.columns * 130 + 17, this._view.viewHeight);
        this.actor._delegate = this;

        this._setupUi();
        this.setupSidebar();
        this._connectEvents();
    },

    _setupUi: function() {

        this._container = new St.Table({
            homogeneous: false,
            x_expand: true,
            y_expand: true
        });

        this.separator = new St.Bin({
            margin_right: 1,
            style_class: 'separator',
            width: 1
        });

        this._layout = new St.Widget({
            clip_to_allocation: true,
            reactive: true
        });
        this._layout.set_size((this._view.columns - 1) * 130, this._view.rows * 130);

        this.appView = new Grid(this._view.rows, this._view.columns - 1);
        this._layout.add_actor(this.appView.actor, { expand: true });

        this.switcher = new Switcher();

        this._pageSwitcher = new St.Bin();
        this._pageSwitcher.add_actor(this.switcher.actor);

        this._container.add(this.separator, {
            col: 1,
            row: 0,
            col_span: 1,
            row_span: 2,
            x_expand: false
        });
        this._container.add(this._layout, {
            col: 2,
            row: 0,
            col_span: 1,
            row_span: 1,
            y_align: St.Align.START
        });

        this.actor.add(this._container, { expand: true });
    },

    setupSidebar: function() {

        if (this.categorySwitcher != null)
            this.categorySwitcher.actor.destroy();

        this.categorySwitcher = new Sidebar();
        this.categorySwitcher.actor.can_focus = false;

        for (let catName in this._view.apps) {
            this.categoryIds.push(catName);
            this.categorySwitcher.addCategory(GLib.dgettext('gnome-menus-3.0', catName));
        }

        this._container.add(this.categorySwitcher.actor, {
            col: 0,
            row: 0,
            col_span: 1,
            row_span: 2,
            x_expand: false
        });
        this.categorySwitcher.connect('selection-changed', Lang.bind(this, function(actor, name, nth) {

            this._view.resetCategoryFocus();
            let category = this.categoryIds[nth];
            this.showFilteredApps(category);
        }));
    },

    _connectEvents: function() {

        this._layout.connect('scroll-event', Lang.bind(this, function(actor, event) {
            switch (event.get_scroll_direction()) {
                case Clutter.ScrollDirection.UP:
                case Clutter.ScrollDirection.LEFT:
                    this.switcher.setActive(this.switcher.active - 1);
                    break;
                case Clutter.ScrollDirection.DOWN:
                case Clutter.ScrollDirection.RIGHT:
                    this.switcher.setActive(this.switcher.active + 1);
                    break;
            }
            return true;
        }));

        this.appView.connect('new-page', Lang.bind(this, function(actor, page) {
            if (this.switcher.size == 0)
                this.switcher.append('1');
            this.switcher.append(page);

            /* Prevents pages from changing */
            this._fromCategory = true;
        }));

        this.switcher.connect('active-changed', Lang.bind(this, function() {
            if (this._fromCategory || this.switcher.active - this.switcher.oldActive == 0) {
                this._fromCategory = false;
                return;
            }

            this.movePage(this.switcher.active - this.switcher.oldActive);
            this._view.searchbar.grabFocus();
        }));

        this.categorySwitcher.selected = 0;
    },

    _addApp: function(app) {

        let appEntry = new AppEntry(app);
        appEntry.connect('app-launched', Lang.bind(this, function() {
            this._view.close(true);
        }));
        this.appView.append(appEntry.actor);
    },

    showFilteredApps: function(category) {

        this.switcher.clearChildren();
        this.appView.clear();

        this._view.apps[category].forEach(function(app) {
            this._addApp(app);
        }, this);

        this.switcher.setActive(0);

        this.appView.actor.set_x(0);
        this._currentPosition = 0;
    },

    movePage: function(step) {

        if (step == 0)
            return;
        if (step < 0 && this._currentPosition >= 0) //Left border
            return;
        if (step > 0 && (-this._currentPosition) >= ((this.appView.getNPages() - 1) * this.appView.getPageColumns() * 130)) //Right border
            return;

        let count = 0;
        let increment = -step * 130 * (this._view.columns - 1) / 10;
        Mainloop.timeout_add(30 / (this._view.columns - 1), Lang.bind(this, function() {

            if (count >= 10) {
                this._currentPosition += -step * 130 * (this._view.columns - 1) - 10 * increment; //We adjust to end of the page
                this.appView.actor.set_x(this._currentPosition);
                return false;
            }

            this._currentPosition += increment;
            this.appView.actor.set_x(this._currentPosition);
            count++;
            return true;
        }));
    },

    showPageSwitcher: function(show) {

        if (this._pageSwitcher.get_parent() == null) {
            this._container.add(this._pageSwitcher, {
                col: 2,
                row: 1,
                col_span: 1,
                row_span: 1,
                x_expand: false,
                y_expand: false
            });
        }

        if (show) {
            this._pageSwitcher.show();
            this._view.bottom.hide();
        }
        else
            this._pageSwitcher.hide();

        this._view.searchbar.grabFocus();
    },

    destroy: function() {
        this.actor.destroy();
    }
});
Signals.addSignalMethods(CategoryView.prototype);

const Grid = new Lang.Class({
    Name: 'Grid',

    _init: function(rows, columns) {

        this._currentRow = 0;
        this._currentCol = 0;

        this.rowSpacing = 20;
        this.columnSpacing = 0;

        this._pageRows = rows;
        this._pageCols = columns;
        this._pageNumber = 1;

        //global.log('Grid Columns: ' + this._pageCols);
        //global.log('Grid Rows: ' + this._pageRows);

        this.actor = new St.Table({
            homogeneous: true,
            style:
                'spacing-rows: ' + this.rowSpacing + 'px;' +
                'spacing-columns: ' + this.columnSpacing + 'px;'
        });
        this.actor._delegate = this;
    },

    append: function(actor) {

        this._updatePosition();

        let col = this._currentCol + this._pageCols * (this._pageNumber - 1);

        //global.log('Adding actor to grid view at' + ' Col: '+ this._currentCol + ' Row: ' + this._currentRow + ' Page: ' + this._pageNumber + ')');

        this.actor.add(actor, {
            col: col,
            row: this._currentRow,
            col_span: 1,
            row_span: 1
        });
        this._currentCol++;
    },

    _updatePosition: function() {

        if (this._currentCol == this._pageCols) {
            this._currentCol = 0;
            this._currentRow++;
        }

        if (this._currentRow == this._pageRows) {
            this._pageNumber++;
            this.emit('new-page', this._pageNumber);
            this._currentRow = 0;
        }
    },

    clear: function() {

        this.actor.get_children().forEach(function(child, index) {
            if (child.get_parent() != null)
                this.actor.remove_actor(child);
            child.destroy();
        }, this);

        this._currentRow = 0;
        this._currentCol = 0;
        this._pageNumber = 1;
    },

    getPageColumns: function() {
        return this._pageCols;
    },

    getPageRows: function() {
        return this._pageRows;
    },

    getNPages: function() {
        return this._pageNumber;
    },

    resize: function(rows, columns) {

        this.clear();
        this._pageRows = rows;
        this._pageCols = columns;
        this._pageNumber = 1;
    },

    getChildAt: function(column, row) {
        let children = this.actor.get_children();
        let child;

        for (let index in children) {
            let meta = this.actor.get_child_meta(children[index]);
            if (column == meta.col && row == meta.row) {
                child = children[index];
                break;
            }
        }

        return child;
    },

    destroy: function() {
        this.actor.destroy();
    }
});
Signals.addSignalMethods(Grid.prototype);

const SearchItem = new Lang.Class({
    Name: 'SearchItem',

    _init: function(app) {

        this.inBox = false;
        this.iconSize = 64;

        this._app = app;

        this._icon = new St.Icon({
            icon_size: this.iconSize,
            gicon: app.icon,
            margin_left: 74 - this.iconSize
        });

        this._nameLabel = new St.Label({
            text: '<b><span size="larger">' + this._fix(app.name) + '</span></b>'
        });
        this._nameLabel.clutter_text.set_ellipsize(Pango.EllipsizeMode.END);
        this._nameLabel.clutter_text.use_markup = true;

        this._descLabel = new St.Label({ text: this._fix(app.description) });
        this._descLabel.clutter_text.set_ellipsize(Pango.EllipsizeMode.END);

        let vbox = new St.BoxLayout({
            margin_top: 5,
            margin_left: 78 - this.iconSize,
            vertical: true
        });
        vbox.add_actor(this._nameLabel);
        vbox.add_actor(this._descLabel);

        let layout = new St.BoxLayout();
        layout.add_actor(this._icon);
        layout.add_actor(vbox);

        this.actor = new St.Button({
            height: this.iconSize + 10,
            style_class: 'button app',
            x_align: Clutter.ActorAlign.START,
            x_fill: true
        });
        this.actor.add_actor(layout);
        this.actor._delegate = this;

        this.actor.connect('queue-redraw', Lang.bind(this, this._onRedraw));
        this.connect('launch-app', Lang.bind(this, function() {
            this._app.launch();
        }));
    },

    _onRedraw: function() {
        this.actor.set_height(this.iconSize + 10);
        this._icon.set_icon_size(this.iconSize);
        this._icon.set_margin_left(74 - this.iconSize);
    },

    _fix: function(text) {
        return text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;');
    },

    destroy: function() {
        this.actor.destroy();
    }
});
Signals.addSignalMethods(SearchItem.prototype);

const SearchView = new Lang.Class({
    Name: 'SearchView',

    _init: function(parent) {

        this._selected = 0;
        this.appsShowed = 0;

        this._view = parent;

        this.actor = new St.BoxLayout({ can_focus: true, vertical: true });
        this.actor.set_width(this._view.columns * 130);
        this.actor._delegate = this;

        this._items = {};
        this._separator = new St.Bin({
            margin_top: 4,
            margin_bottom: 4,
            style_class: 'separator',
            height: 1
        });
        this._separator.inBox = false
    },

    addApps: function(apps) {

        apps.forEach(function(app) {
            let searchItem = new SearchItem(app);

            this.appendApp(app, searchItem);
        }, this);
    },

    appendApp: function(app, searchItem) {

        searchItem.actor.connect('clicked', Lang.bind(this, function() {
            app.launch();
            this.emit('app-launched');
            return true;
        }));

        this._items[app.name] = searchItem;
    },

    showApp: function(app) {

        if (!(this._items.hasOwnProperty(app.name))) {
            let searchItem = new SearchItem(app);
            this.appendApp(app, searchItem);
        }

        if (this.appsShowed == 1)
            this._showSeparator();

        if (!(this._items[app.name].inBox)) {
            this.actor.add_actor(this._items[app.name].actor, {
                expand: true,
                x_fill: true,
                y_fill: true
            });
            this._items[app.name].inBox = true;
            this._items[app.name].iconSize = 48;
            this._items[app.name].actor.queue_redraw();
        }

        this._items[app.name].actor.show();
        this.appsShowed++;

        if (this.appsShowed == 1) {
            this._items[app.name].iconSize = 64;
            this._items[app.name].actor.queue_redraw();
            this.selected = 0;
        }
    },

    hideApp: function(app) {
        this._items[app.name].actor.hide();
        this.appsShowed--;
    },

    hideAll: function() {

        this._hideSeparator();

        for (let appName in this._items) {
            let app = this._items[appName];
            app.actor.hide();
            if (app.inBox) {
                this.actor.remove_actor(app.actor);
                app.inBox = false;
            }
        }
        this.appsShowed = 0;
    },

    addCommand: function(command) {

        let app = new Backend.App(command, true);
        let item = new SearchItem(app);

        this.appendApp(app, item);

        this.showApp(app);
    },

    _showSeparator: function() {

        if (!(this._separator.inBox)) {
            this.actor.add_actor(this._separator);
            this._separator.inBox = true;
        }
        this._separator.show();
    },

    _hideSeparator: function() {

        this._separator.hide();
        if (this._separator.inBox) {
            this.actor.remove_actor(this._separator);
            this._separator.inBox = false;
        }
    },

    _selectNth: function(index) {

        if (this._selectedApp != null)
            this._selectedApp.actor.remove_style_pseudo_class('hover');

        let selectedActor = this.actor.get_child_at_index(index);
        // Lame
        for (let appName in this._items) {
            let searchItem = this._items[appName];
            if (selectedActor == searchItem.actor) {
                this._selectedApp = searchItem;
                break;
            }
        }
        this._selectedApp.actor.add_style_pseudo_class('hover');
    },

    launchSelected: function() {

        this._selectedApp.emit('launch-app');
    },

    destroy: function() {
        this.actor.destroy();
    },

    get selected() {
        return this._selected;
    },

    set selected(value) {
        if (value < 0 || value > this.actor.get_children().length - 1)
            return;

        if (value != 1) {
            this._selectNth(value);
            this._selected = value;
        } else if (this._selected - value > 0) {
            /* Get a sort of direction */
            this._selectNth(value - 1);
            this._selected = value -1;
        } else {
            this._selectNth(value + 1);
            this._selected = value + 1;
        }
    }
});
Signals.addSignalMethods(SearchView.prototype);

const Sidebar = new Lang.Class({
    Name: 'Sidebar',

    _init: function() {

        this.actor = new St.BoxLayout({
            vertical: true,
            width: 145
        });
        this.actor.add_style_class_name('sidebar');
        this.actor._delegate = this;
    },

    addCategory: function(entryName) {

        let button = new St.Button({
            toggle_mode: true,
            style: 'padding-left: 12px;' +
                   'padding-right: 12px;',
            style_class: 'button',
            x_align: St.Align.START
        });
        button.connect('clicked', Lang.bind(this, this.selectionChange));

        let label = new St.Label({
            text: entryName
        });
        button.add_actor(label);

        this.actor.add_actor(button);
    },

    selectionChange: function(button) {

        if (this._selected != null)
            this.actor.get_child_at_index(this._selected).set_checked(false);

        button.set_checked(true);

        let nth = this.actor.get_children().indexOf(button);
        let name = button.get_label();

        this._selected = nth;
        this.emit('selection-changed', name, nth);
    },

    selectNth: function(nth) {

        let button;

        if (nth < this.catSize) {
            button = this.actor.get_child_at_index(nth);
        } else {
            return false;
        }

        this.selectionChange(button);
        return true;
    },

    destroy: function() {
        this.actor.destroy();
    },

    get catSize() {
        return this.actor.get_children().length;
    },

    get selected() {
        return this._selected;
    },
    set selected(value) {
        if (value >= 0 && value < this.catSize) {
            this.selectNth(value);
            this._selected = value;
        }
    }
});
Signals.addSignalMethods(Sidebar.prototype);

const Switcher = new Lang.Class({
    Name: 'Switcher',

    _init: function() {

        this.active = -1;
        this.oldActive = -1;

        this.actor = new St.BoxLayout({
            can_focus: false,
            style: 'spacing: 4px;'
        });
        this.actor._delegate = this;
    },

    append: function(label) {

        let button = new St.Button({
            label: label.toString(),
            width: 30,
            can_focus: false,
            style_class: 'button switcher',
            toggle_mode: true
        });

        button.connect('clicked', Lang.bind(this, function(event) {
            let select = this.actor.get_children().indexOf(button);
            this.setActive(select);
            return true;
        }));

        this.actor.add_actor(button);
    },

    setActive: function(newActive) {

        if (newActive >= this.actor.get_children().length)
            return;

        // Why is this needed here but not in the Vala version?
        if (newActive < 0)
            return;

        if (this.active >= 0)
            this.actor.get_children()[this.active].set_checked(false);

        this.oldActive = this.active;
        this.active = newActive;

        this.emit('active-changed');

        this.actor.get_children()[this.active].set_checked(true);
    },

    clearChildren: function() {

        this.actor.get_children().forEach(function(button, index) {
            button.hide();
            if (button.get_parent() != null)
                this.actor.remove_actor(button);
        }, this);

        this.oldActive = 0;
        this.active = 0;
    },

    destroy: function() {
        this.actor.destroy();
    },

    get size() {
        return this.actor.get_children().length;
    }
});
Signals.addSignalMethods(Switcher.prototype);
