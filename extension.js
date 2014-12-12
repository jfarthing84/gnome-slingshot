const Clutter = imports.gi.Clutter;
const GMenu = imports.gi.GMenu;
const Lang = imports.lang;
const Mainloop = imports.mainloop;
const Pango = imports.gi.Pango;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Gtk = imports.gi.Gtk;
const Shell = imports.gi.Shell;
const Signals = imports.signals;
const St = imports.gi.St;

const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;
const Backend = Me.imports.backend;
const Granite = Me.imports.granite;
const Widgets = Me.imports.widgets;

let settings;

const SlingshotView = new Lang.Class({
    Name: 'SlingshotView',
    Extends: Granite.widgets.PopOver,

    _init: function(sourceActor, arrowAlignment, arrowSide) {

        this.parent(sourceActor, arrowAlignment, arrowSide);

        this.Modality = {
            NORMAL_VIEW: 0,
            CATEGORY_VIEW: 1,
            SEARCH_VIEW: 2
        }

        this._currentPosition = 0;
        this._searchViewPosition = 0;
        this._modality = null;

        this._columnFocus = 0;
        this._rowFocus = 0;

        this._categoryColumnFocus = 0;
        this._categoryRowFocus = 0;

        this._settingSignals = [];

        this._readSettings(true);

        this.appSystem = new Backend.AppSystem();

        this._categories = this.appSystem.getCategories();
        this.apps = this.appSystem.getApps();

        let resolution = Main.layoutManager.primaryMonitor.width + 'x' + Main.layoutManager.primaryMonitor.height;
        if (settings.get_string('screen-resolution') != resolution)
            this._setupSize();
        this.box.set_height(this._defaultRows * 145 + 140);
        this._setupUi();
        this._connectSignals();
    },

    _setupSize: function() {

        global.log('Setting up size...');
        settings.set_string('screen-resolution', Main.layoutManager.primaryMonitor.width + 'x' + Main.layoutManager.primaryMonitor.height);
        this._defaultColumns = 5;
        this._defaultRows = 3;

        while ((this._defaultColumns * 130 + 48 >= 2 * Main.layoutManager.primaryMonitor.width / 3)) {
            this._defaultColumns--;
        }

        while ((this._defaultRows * 145 + 72 >= 2 * Main.layoutManager.primaryMonitor.height / 3)) {
            this._defaultRows--;
        }

        if (settings.get_int('columns') != this._defaultColumns)
            settings.set_int('columns', this._defaultColumns);
        if (settings.get_int('rows') != this._defaultRows)
            settings.set_int('rows', this._defaultRows);

        //global.log('Default Columns: ' + this._defaultColumns);
        //global.log('Default Rows: ' + this._defaultRows);
    },

    _setupUi: function() {

        global.log('Setting up UI...');

        this.container = new St.BoxLayout({
            vertical: true
        });

        this.top = new St.BoxLayout({
            margin_top: 12,
            margin_right: 12,
            margin_bottom: 12,
            margin_left: 12
        });

        let topSeparator = new St.Label({ text: '' });

        this.viewSelector = new Granite.widgets.ModeButton();

        let image = new St.Icon({
            icon_size: 16,
            gicon: new Gio.ThemedIcon({ name: 'view-grid-symbolic' })
        });
        this.viewSelector.append(image, _('View as Grid'));

        let image = new St.Icon({
            icon_size: 16,
            gicon: new Gio.ThemedIcon({ name: 'view-list-symbolic' })
        });
        this.viewSelector.append(image, _('View by Category'));

        if (settings.get_boolean('use-category'))
            this.viewSelector.selected = 1;
        else
            this.viewSelector.selected = 0;

        this.searchbar = new Granite.widgets.SearchBar(_("Search Apps..."));
        this.searchbar.pauseDelay = 200;
        this.searchbar.actor.set_width(250);
        this.searchbar.actor.set_x_align(Clutter.ActorAlign.END);
        this.searchbar.actor.connect('button-press-event', Lang.bind(this, function(actor, event) {
            return event.button === 3;
        }));

        if (settings.get_boolean('show-category-filter'))
            this.top.add(this.viewSelector.actor);
        this.top.add(topSeparator, { expand: true });
        this.top.add(this.searchbar.actor);

        this.center = new St.BoxLayout({
            margin_top: 0,
            margin_right: 12,
            margin_bottom: 12,
            margin_left: 12
        });

        // Create the layout which works like view_manager
        this.viewManager = new St.Widget({
            clip_to_allocation: true
        });
        this.viewManager.set_size(this._defaultColumns * 130, this._defaultRows * 145);
        this.center.add(this.viewManager, { expand: true, x_fill: true, y_fill: true, x_align: St.Align.START, y_align: St.Align.START });

        // Create the "NORMAL_VIEW"
        this._gridView = new Widgets.Grid(this._defaultRows, this._defaultColumns);
        this.viewManager.add_actor(this._gridView.actor, { expand: true, x_fill: true, y_fill: false, x_align: St.Align.START, y_align: St.Align.START });

        // Create the "SEARCH_VIEW"
        this._searchView = new Widgets.SearchView(this);
        for (let category in this.apps) {
            this._searchView.addApps(this.apps[category]);
        }
        this.viewManager.add_actor(this._searchView.actor, { expand: true, x_fill: true, y_fill: true, x_align: St.Align.START, y_align: St.Align.START });

        // Create the "CATEGORY_VIEW"
        this._categoryView = new Widgets.CategoryView(this);
        this.viewManager.add_actor(this._categoryView.actor, { expand: true, x_fill: true, y_fill: false, x_align: St.Align.START, y_align: St.Align.START });

        this.pageSwitcher = new Widgets.Switcher();

        this.bottom = new St.Bin({
            margin_top: 0,
            margin_right: 24,
            margin_bottom: 12,
            margin_left: 24
        });
        this.bottom.add_actor(this.pageSwitcher.actor);

        this.container.add(this.top, {});
        this.container.add(this.center, { expand: true, x_fill: false, y_fill: true });
        this.container.add(this.bottom, {});

        this.box.add(this.container, { expand: true, x_fill: true, y_fill: true });

        if (settings.get_boolean('use-category'))
            this._setModality(this.Modality.CATEGORY_VIEW);
        else
            this._setModality(this.Modality.NORMAL_VIEW);

        global.log('UI setup complete.');
    },

    _connectSignals: function() {


        // Make some connections that are there by default in GTK/Granite
        this.box.set_reactive(true);
        this.box.connect('scroll-event', Lang.bind(this, this._onScrollEvent));

        this.box.connect('key-focus-in', Lang.bind(this, function() {
            this.searchbar.grabFocus();
            return false;
        }));

        this.box.connect('key-press-event', Lang.bind(this, this._onKeyPress));
        this.searchbar.connect('text-changed-pause', Lang.bind(this, function(actor, text) {
            this._search(text);
        }));
        this.searchbar.grabFocus();

        this.searchbar.connect('activate', Lang.bind(this, function() {
            if (this._modality == this.Modality.SEARCH_VIEW) {
                this._searchView.launchSelected();
                this.close(true);
            } else {
                let keyFocus = global.stage.get_key_focus();
                if (keyFocus._delegate && keyFocus._delegate instanceof Widgets.AppEntry)
                    keyFocus._delegate.launchApp();
            }
        }));

        this._searchView.connect('app-launched', Lang.bind(this, function() {
            this.close(true);
        }));

        this._gridView.connect('new-page', Lang.bind(this, function(actor, pageNumber) {
            this.pageSwitcher.append(pageNumber);
        }));
        this.populateGridView();

        this.pageSwitcher.connect('active-changed', Lang.bind(this, function() {
            this._movePage(this.pageSwitcher.active - this.pageSwitcher.oldActive);
            this.searchbar.grabFocus();
        }));

        this.viewSelector.connect('mode-changed', Lang.bind(this, function() {
            this._setModality(this.viewSelector.selected);
        }));

        // Auto-update settings when changed
        this._settingSignals.push(settings.connect('changed::columns', Lang.bind(this, function() {
            this._readSettings(false, true, false);
        })));
        this._settingSignals.push(settings.connect('changed::rows', Lang.bind(this, function() {
            this._readSettings(false, false, true);
        })));
        this._settingSignals.push(settings.connect('changed::show-category-filter', Lang.bind(this, function() {
            if (settings.get_boolean('show-category-filter'))
                this.top.insert_child_at_index(this.viewSelector.actor, 0);
            else
                this.top.remove_child(this.viewSelector.actor);
        })));
        this._settingSignals.push(settings.connect('changed::use-category', Lang.bind(this, function() {
            if (settings.get_boolean('use-category'))
                this._setModality(this.Modality.CATEGORY_VIEW);
            else
                this._setModality(this.Modality.NORMAL_VIEW);
        })));

        this._appSystemChangedId = this.appSystem.connect('changed', Lang.bind(this, function() {

            this._categories = this.appSystem.getCategories();
            this.apps = this.appSystem.getApps();

            this.populateGridView();
            this._categoryView.setupSidebar();
        }));
    },

    _changeViewMode: function(key) {
        switch (key) {
            case 1: // Normal view
                this.viewSelector.selected = 0;
                break;
            default: // Category view
                this.viewSelector.selected = 1;
                break;
        }
    },

    _onKeyPress: function(actor, event) {
        let symbol = event.get_key_symbol();
        let modifierType = event.get_state();

        switch (symbol) {
            case Clutter.KEY_F4:
                if (modifierType == Clutter.ModifierType.MOD1_MASK)
                    this.close(true);
                break;

            case Clutter.KEY_Escape:
                if (this.searchbar.actor.text.length > 0) {
                    this.searchbar.actor.text = '';
                } else {
                    this.close(true);
                }

                return true;

            case Clutter.KP_Enter:
            case Clutter.KEY_Return:
            case Clutter.KEY_KP_Enter:
                if (this._modality == this.Modality.SEARCH_VIEW) {
                    this._searchView.launchSelected();
                    this.close(true);
                } else {
                    let keyFocus = global.stage.get_key_focus();
                    if (keyFocus._delegate && keyFocus._delegate instanceof Widgets.AppEntry)
                        keyFocus._delegate.launchApp();
                }
                return true;

            case Clutter.KEY_Alt_L:
            case Clutter.KEY_Alt_R:
                break;

            case Clutter.KEY_0:
            case Clutter.KEY_1:
            case Clutter.KEY_2:
            case Clutter.KEY_3:
            case Clutter.KEY_4:
            case Clutter.KEY_5:
            case Clutter.KEY_6:
            case Clutter.KEY_7:
            case Clutter.KEY_8:
            case Clutter.KEY_9:
                break;

            case Clutter.KEY_Tab:
                if (this._modality == this.Modality.NORMAL_VIEW) {
                    this.viewSelector.selected = 1;
                    let newFocus = this._categoryView.appView.getChildAt(this._categoryColumnFocus, this._categoryRowFocus);
                    if (newFocus != null)
                        newFocus.grab_key_focus();
                } else if (this._modality == this.Modality.CATEGORY_VIEW) {
                    this.viewSelector.selected = 0;
                    let newFocus = this._gridView.getChildAt(this._columnFocus, this._rowFocus);
                    if (newFocus != null)
                        newFocus.grab_key_focus();
                }
                break;

            case Clutter.KEY_Left:
                if (this._modality == this.Modality.NORMAL_VIEW) {
                    if (modifierType == Clutter.ModifierType.SHIFT_MASK) // Shift + Left
                        this.pageSwitcher.setActive(this.pageSwitcher.active - 1);
                    else
                        this._normalMoveFocus(-1, 0);
                } else if (this._modality == this.Modality.CATEGORY_VIEW) {
                    if (modifierType == Clutter.ModifierType.SHIFT_MASK) // Shift + Left
                        this._categoryView.switcher.setActive(this._categoryView.switcher.active - 1);
                    else if (!this.searchbar.hasFocus()) {// the user has already selected an AppEntry
                        this._categoryMoveFocus(-1, 0);
                    }
                } else
                    return false;
                break;

            case Clutter.KEY_Right:
                if (this._modality == this.Modality.NORMAL_VIEW) {
                    if (modifierType == Clutter.ModifierType.SHIFT_MASK) // Shift + Right
                        this.pageSwitcher.setActive(this.pageSwitcher.active + 1);
                    else
                        this._normalMoveFocus(+1, 0);
                } else if (this._modality == this.Modality.CATEGORY_VIEW) {
                    if (modifierType == Clutter.ModifierType.SHIFT_MASK) // Shift + Right
                        this._categoryView.switcher.setActive(this._categoryView.switcher.active + 1);
                    else if (this.searchbar.hasFocus()) // there's no AppEntry selected, the user is switching category
                        this._topLeftFocus();
                    else // the user has already selected an AppEntry
                        this._categoryMoveFocus(+1, 0);
                } else {
                    return false;
                }
                break;

            case Clutter.KEY_Up:
                if (this._modality == this.Modality.NORMAL_VIEW) {
                    this._normalMoveFocus(0, -1);
                } else if (this._modality == this.Modality.CATEGORY_VIEW) {
                    if (modifierType == Clutter.ModifierType.SHIFT_MASK) { // Shift + Up
                        if (this._categoryView.categorySwitcher.selected != 0) {
                            this._categoryView.categorySwitcher.selected--;
                            this._topLeftFocus();
                        }
                    } else if (this.searchbar.hasFocus()) {
                        this._categoryView.categorySwitcher.selected--;
                    } else {
                        this._categoryMoveFocus(0, -1);
                    }
                } else if (this._modality == this.Modality.SEARCH_VIEW) {
                    this._searchView.selected--;
                    this._searchViewUp();
                }
                break;

            case Clutter.KEY_Down:
                if (this._modality == this.Modality.NORMAL_VIEW) {
                    this._normalMoveFocus(0, +1);
                } else if (this._modality == this.Modality.CATEGORY_VIEW) {
                    if (modifierType == Clutter.ModifierType.SHIFT_MASK) { // Shift + Down
                        this._categoryView.categorySwitcher.selected++;
                        this._topLeftFocus();
                    } else if (this.searchbar.hasFocus()) {
                        this._categoryView.categorySwitcher.selected++;
                    } else { // the user has already selected an AppEntry
                        this._categoryMoveFocus(0, +1);
                    }
                } else if (this._modality == this.Modality.SEARCH_VIEW) {
                    this._searchView.selected++;
                    if (this._searchView.selected > 7)
                        this._searchViewDown();
                }
                break;

            case Clutter.KEY_Page_Up:
                if (this._modality == this.Modality.NORMAL_VIEW) {
                    this.pageSwitcher.setActive(this.pageSwitcher.active - 1);
                    if (this.pageSwitcher.active != 0) // we don't wanna lose focus if we don't actually change page
                        this.searchbar.grabFocus(); // this is because otherwise focus isn't the current page
                } else if (this._modality == this.Modality.CATEGORY_VIEW) {
                    this._categoryView.categorySwitcher.selected--;
                    this._topLeftFocus();
                }
                break;

            case Clutter.KEY_Page_Down:
                if (this._modality == this.Modality.NORMAL_VIEW) {
                    this.pageSwitcher.setActive(this.pageSwitcher.active + 1);
                    if (this.pageSwitcher.active != this._gridView.getNPages() - 1) // we don't wanna lose focus if we don't actually change page
                        this.searchbar.grabFocus(); //this is because otherwise focus isn't the current page
                } else if (this._modality == this.Modality.CATEGORY_VIEW) {
                    this._categoryView.categorySwitcher.selected++;
                    this._topLeftFocus();
                }
                break;

            case Clutter.KEY_BackSpace:
                if (modifierType == Clutter.ModifierType.SHIFT_MASK) { // Shift + Delete
                    this.searchbar.actor.text = "";
                } else if (this.searchbar.hasFocus()) {
                    return false;
                } else {
                    this.searchbar.grabFocus();
                    this.searchbar.actor.clutter_text.set_cursor_position(this.searchbar.actor.text.length);
                    return false;
                }
                break;

            case Clutter.KEY_Home:
                if (this.searchbar.actor.text.size > 0) {
                    return false;
                }

                if (this._modality == this.Modality.NORMAL_VIEW) {
                    this.pageSwitcher.setActive(0);
                } else if (this._modality == this.Modality.CATEGORY_VIEW) {
                    this._categoryView.categorySwitcher.selected = 0;
                    this._topLeftFocus();
                }
                break;

            case Clutter.KEY_End:
                if (this.searchbar.actor.text.size > 0) {
                    return false;
                }

                if (this._modality == this.Modality.NORMAL_VIEW) {
                    this.pageSwitcher.setActive(this._gridView.getNPages() - 1);
                } else if (this._modality == this.Modality.CATEGORY_VIEW) {
                    this._categoryView.categorySwitcher.selected = this._categoryView.categorySwitcher.catSize - 1;
                    this._topLeftFocus();
                }
                break;

            default:
                if (!this.searchbar.hasFocus()) {
                    this.searchbar.grabFocus();
                    this.searchbar.actor.clutter_text.set_cursor_position(this.searchbar.actor.text.length);
                }
                return false;
        }

        return true;
    },

    _onScrollEvent: function(actor, event) {

        switch (event.get_scroll_direction()) {
            case Clutter.ScrollDirection.UP:
            case Clutter.ScrollDirection.LEFT:
                if (this._modality == this.Modality.NORMAL_VIEW)
                    this.pageSwitcher.setActive(this.pageSwitcher.active - 1);
                else if (this._modality == this.Modality.SEARCH_VIEW)
                    this._searchViewUp();
                else
                    this._categoryView.switcher.setActive(this._categoryView.switcher.active - 1);
                break;
            case Clutter.ScrollDirection.DOWN:
            case Clutter.ScrollDirection.RIGHT:
                if (this._modality == this.Modality.NORMAL_VIEW)
                    this.pageSwitcher.setActive(this.pageSwitcher.active + 1);
                else if (this._modality == this.Modality.SEARCH_VIEW)
                    this._searchViewDown();
                else
                    this._categoryView.switcher.setActive(this._categoryView.switcher.active + 1);
                break;
        }
    },

    showSlingshot: function() {

        this.searchbar.actor.text = '';
        this.searchbar.grabFocus();
        this._setModality(this.viewSelector.selected);
    },

    _movePage: function(step) {

        if (step == 0)
            return;
        if (step < 0 && this._currentPosition >= 0)
            return;
        if (step > 0 && (-this._currentPosition) >= ((this._gridView.getNPages() - 1) * this._gridView.getPageColumns() * 130))
            return;

        let count = 0;
        let increment = -step * 130 * this.columns / 10;
        Mainloop.timeout_add(30 / this.columns, Lang.bind(this, function() {

            if (count >= 10) {
                this._currentPosition += -step * 130 * this.columns - 10 * increment;
                this._gridView.actor.set_x(this._currentPosition);
                return false;
            }

            this._currentPosition += increment;
            this._gridView.actor.set_x(this._currentPosition);
            count++;
            return true;
        }));
    },

    _searchViewDown: function() {

        if (this._searchView.appsShowed < this._defaultRows * 3)
            return;

        if ((this._searchViewPosition) > -(this._searchView.appsShowed * 48)) {
            this._searchView.actor.set_y(this._searchViewPosition - 2 * 38);
            this._searchViewPosition -= 2 * 38;
        }
    },

    _searchViewUp: function() {

        if (this._searchViewPosition < 0) {
            this._searchView.actor.set_y(this._searchViewPosition + 2 * 38);
            this._searchViewPosition += 2 * 38;
        }
    },

    _setModality: function(newModality) {

        this._modality = newModality;

        switch (this._modality) {
            case this.Modality.NORMAL_VIEW:

                if (settings.get_boolean('use-category'))
                    settings.set_boolean('use-category', false);
                this.bottom.show();
                this.viewSelector.actor.show();
                this.pageSwitcher.actor.show();
                this._categoryView.showPageSwitcher(false);
                this._searchView.actor.hide();
                this._categoryView.actor.hide();
                this._gridView.actor.show();

                // change the paddings/margins back to normal
                //get_content_area().set_margin_left(PADDINGS.left + SHADOW_SIZE + 5);
                this.box.set_style('padding-left: ' + this.PADDINGS.left + 5 + 'px');
                this.center.set_margin_left(12);
                this.top.set_margin_left(12);
                this.viewManager.set_size(this._defaultColumns * 130, this._defaultRows * 145);
                break;

            case this.Modality.CATEGORY_VIEW:

                if (!settings.get_boolean('use-category'))
                    settings.set_boolean('use-category', true);
                this.bottom.show();
                this.viewSelector.actor.show();
                this.pageSwitcher.actor.hide();
                this._categoryView.showPageSwitcher(true);
                this._gridView.actor.hide();
                this._searchView.actor.hide();
                this._categoryView.actor.show();

                // remove the padding/margin on the left
                //get_content_area().set_margin_left(PADDINGS.left + SHADOW_SIZE);
                this.box.set_style('padding-left: 0px');
                this.center.set_margin_left(0);
                this.top.set_margin_left(17);
                this.viewManager.set_size(this._defaultColumns * 130 + 17, this._defaultRows * 145);
                break;

            case this.Modality.SEARCH_VIEW:

                this.viewSelector.actor.hide();
                this.bottom.hide(); // Hide the switcher
                this._gridView.actor.hide();
                this._categoryView.actor.hide();
                this._searchView.actor.show();

                // change the paddings/margins back to normal
                //get_content_area().set_margin_left(PADDINGS.left + SHADOW_SIZE + 5);
                this.box.set_style('padding-left: ' + this.PADDINGS.left + 5 + 'px');
                this.center.set_margin_left(12);
                this.top.set_margin_left(12);
                this.viewManager.set_size(this._defaultColumns * 130, this._defaultRows * 145);
                break;
        }
    },

    _search: function(text) {

        let stripped = text.toLowerCase().trim();

        if (stripped == '') {
            this._setModality(this.viewSelector.selected);
            return;
        }

        if (this._modality != this.Modality.SEARCH_VIEW)
            this._setModality(this.Modality.SEARCH_VIEW);
        this._searchViewPosition = 0;
        this._searchView.actor.set_position(0, this._searchViewPosition);
        this._searchView.hideAll();

        let filtered = this.appSystem.searchResults(stripped);

        filtered.forEach(function(app) {
            this._searchView.showApp(app);
        }, this);

        this._searchView.addCommand(text);
    },

    populateGridView: function() {

        this.pageSwitcher.clearChildren();
        this._gridView.clear();

        this.pageSwitcher.append('1');
        this.pageSwitcher.active = 0;

        this.appSystem.getAppsByName().forEach(function(app, index) {
            let appEntry = new Widgets.AppEntry(app);
            appEntry.connect('app-launched', Lang.bind(this, function() {
                this.close(true);
            }));
            this._gridView.append(appEntry.actor);
        }, this);

        this._gridView.actor.show();
        this._gridView.actor.set_x(0);
        this._currentPosition = 0;
    },

    _readSettings: function(firstStart, checkColumns, checkRows) {

        if (checkColumns == null)
            checkColumns = true;
        if (checkRows == null)
            checkRows = true;

        if (checkColumns) {
            if (settings.get_int('columns') > 3) {
                this._defaultColumns = settings.get_int('columns');
            } else {
                this._defaultColumns = 4;
                settings.set_int('columns', 4);
            }
        }

        if (checkRows) {
            if (settings.get_int('rows') > 1) {
                this._defaultRows = settings.get_int('rows');
            } else {
                this._defaultRows = 2;
                settings.set_int('rows', 2);
            }
        }

        if (!firstStart) {
            this._gridView.resize(this._defaultRows, this._defaultColumns);
            this.populateGridView();
            this.box.set_height(this._defaultRows * 145 + 140);

            this._categoryView.appView.resize(this._defaultRows, this._defaultColumns);
            this._categoryView.actor.set_size(this.columns * 130 + 17, this.viewHeight);
            this._categoryView.showFilteredApps(this._categoryView.categoryIds[this._categoryView.categorySwitcher.selected]);
        }
    },

    _normalMoveFocus: function(deltaColumn, deltaRow) {
        if (global.stage.get_key_focus()._delegate instanceof Widgets.AppEntry) { // we check if any AppEntry has focus. If it does, we move
            let newFocus = this._gridView.getChildAt(this._columnFocus + deltaColumn, this._rowFocus + deltaRow); // we check if the new widget exists
            if (newFocus == null) {
                if (deltaColumn <= 0)
                    return;
                else {
                    newFocus = this._gridView.getChildAt(this._columnFocus + deltaColumn, 0);
                    deltaRow = -this._rowFocus; // so it's 0 at the end
                    if (newFocus == null)
                        return;
                }
            }
            this._columnFocus += deltaColumn;
            this._rowFocus += deltaRow;
            if (deltaColumn > 0 && this._columnFocus % this._gridView.getPageColumns() == 0 ) //check if we need to change page
                this.pageSwitcher.setActive(this.pageSwitcher.active + 1);
            else if (deltaColumn < 0 && (this._columnFocus + 1) % this._gridView.getPageColumns() == 0) //check if we need to change page
                this.pageSwitcher.setActive(this.pageSwitcher.active - 1);
            newFocus.grab_key_focus();
        }
        else { // we move to the first app in the top left corner of the current page
            this._gridView.getChildAt(this.pageSwitcher.active * this._gridView.getPageColumns(), 0).grab_key_focus();
            this._columnFocus = this.pageSwitcher.active * this._gridView.getPageColumns();
            this._rowFocus = 0;
        }
    },

    _categoryMoveFocus: function(deltaColumn, deltaRow) {
        try {
            let newFocus = this._categoryView.appView.getChildAt(this._categoryColumnFocus + deltaColumn, this._categoryRowFocus + deltaRow);
            if (newFocus == null) {
                if (deltaRow < 0 && this._categoryView.categorySwitcher.selected != 0) {
                    global.log('Switching to previous category...');
                    this._categoryView.categorySwitcher.selected--;
                    this._topLeftFocus();
                    return;
                }
                else if (deltaRow > 0 && this._categoryView.categorySwitcher.selected != this._categoryView.categorySwitcher.catSize - 1) {
                    global.log('Switching to next category...');
                    this._categoryView.categorySwitcher.selected++;
                    this._topLeftFocus();
                    return;
                }
                else if (deltaColumn > 0 && (this._categoryColumnFocus + deltaColumn) % this._categoryView.appView.getPageColumns() == 0
                          && this._categoryView.switcher.active + 1 != this._categoryView.appView.getNPages()) {
                    this._categoryView.switcher.setActive(this._categoryView.switcher.active + 1);
                    this._topLeftFocus();
                    return;
                }
                else if (this._categoryColumnFocus == 0 && deltaColumn < 0) {
                    this.searchbar.grabFocus();
                    this._categoryColumnFocus = 0;
                    this._categoryRowFocus = 0;
                    return;
                }
                else
                    return;
            }
            this._categoryColumnFocus += deltaColumn;
            this._categoryRowFocus += deltaRow;
            if (deltaColumn > 0 && this._categoryColumnFocus % this._categoryView.appView.getPageColumns() == 0 ) { // check if we need to change page
                this._categoryView.switcher.setActive(this._categoryView.switcher.active + 1);
            }
            else if (deltaColumn < 0 && (this._categoryColumnFocus + 1) % this._categoryView.appView.getPageColumns() == 0) {
                // check if we need to change page
                this._categoryView.switcher.setActive(this._categoryView.switcher.active - 1);
            }
            newFocus.grab_key_focus();
        } catch(e) {
            global.logError(e);
        }
    },

    // this method moves focus to the first AppEntry in the top left corner of the current page. Works in CategoryView only
    _topLeftFocus: function() {
        // this is the first column of the current page
        let firstColumn = this._categoryView.switcher.active * this._categoryView.appView.getPageColumns();
        this._categoryView.appView.getChildAt(firstColumn, 0).grab_key_focus();
        this._categoryColumnFocus = firstColumn;
        this._categoryRowFocus = 0;
    },

    resetCategoryFocus: function() {
        this._categoryColumnFocus = 0;
        this._categoryRowFocus = 0;
        this.searchbar.grabFocus(); // So we don't loose focus
    },

    destroy: function() {
        for (let id in this._settingSignals) {
            settings.disconnect(id);
        }
        this.appSystem.disconnect(this._appSystemChangedId);
        this.appSystem.destroy();
        this.parent();
    },

    get columns() {
        return this._gridView.getPageColumns();
    },

    get rows() {
        return this._gridView.getPageRows();
    },

    get viewHeight() {
        return (this.rows * 130 + this.rows * this._gridView.rowSpacing + 35);
    }
});
Signals.addSignalMethods(SlingshotView.prototype);

const SlingshotButton = new Lang.Class({
    Name: 'SlingshotButton',
    Extends: PanelMenu.Button,

    _init: function() {
        this.parent(1.0, null, false);
        this.setMenu(new SlingshotView(this.actor, 1.0, St.Side.TOP));
        Main.panel.menuManager.addMenu(this.menu);
        this.menu.box.add_style_class_name('slingshot');

        let hbox = new St.BoxLayout({ style_class: 'panel-status-menu-box' });

        this._label = new St.Label({
            text: _('Applications'),
            y_expand: true,
            y_align: Clutter.ActorAlign.CENTER
        });
        hbox.add_child(this._label);

        this.actor.add_actor(hbox);
        this.actor.name = 'panelApplications';
        this.actor.label_actor = this._label;
    },

    _onOpenStateChanged: function(menu, open) {
        if (open) {
            this.menu.showSlingshot();

            // Fix lost focus on open
            if (this._menuToggleTimeoutId > 0)
                Mainloop.source_remove(this._menuToggleTimeoutId);

            this._menuToggleTimeoutId = Mainloop.timeout_add(100, Lang.bind(this, function() {
                menu.searchbar.actor.text = '';
                menu.searchbar.grabFocus();
            }));

        } else {
            if (this._menuToggleTimeoutId > 0)
                Mainloop.source_remove(this._menuToggleTimeoutId);
        }
        this.parent(menu, open);
    },

    destroy: function() {
        this.menu.actor.get_children().forEach(function(c) { c.destroy() });
        this.parent();
    }
});

let Slingshot;
let activitiesButton;

function enable() {
    activitiesButton = Main.panel.statusArea['activities'];
    activitiesButton.container.hide();
    Slingshot = new SlingshotButton();
    Main.panel.addToStatusArea('slingshot', Slingshot, 1, 'left');

    /*Main.wm.setCustomKeybindingHandler('panel-main-menu',
                                       Shell.KeyBindingMode.NORMAL |
                                       Shell.KeyBindingMode.OVERVIEW,
                                       function() {
                                           appsMenuButton.menu.toggle();
                                       });*/
}

function disable() {
    Main.panel.menuManager.removeMenu(Slingshot.menu);
    Slingshot.destroy();
    activitiesButton.container.show();

    /*Main.wm.setCustomKeybindingHandler('panel-main-menu',
                                       Shell.KeyBindingMode.NORMAL |
                                       Shell.KeyBindingMode.OVERVIEW,
                                       Main.sessionMode.hasOverview ?
                                       Lang.bind(Main.overview, Main.overview.toggle) :
                                       null);*/
}

function init(metadata) {
    settings = Convenience.getSettings();
}
