

describe('authoring', () => {
    var GUID = 'urn:tag:superdesk-1';
    var USER = 'user:1';
    var ITEM = {guid: GUID};

    beforeEach(window.module(($provide) => {
        $provide.constant('lodash', _);
    }));

    beforeEach(window.module('superdesk.apps.publish'));
    beforeEach(window.module('superdesk.core.preferences'));
    beforeEach(window.module('superdesk.apps.archive'));
    beforeEach(window.module('superdesk.apps.authoring'));
    beforeEach(window.module('superdesk.core.auth'));
    beforeEach(window.module('superdesk.apps.workspace.content'));
    beforeEach(window.module('superdesk.mocks'));
    beforeEach(window.module('superdesk.core.privileges'));
    beforeEach(window.module('superdesk.apps.desks'));
    beforeEach(window.module('superdesk.templates-cache'));
    beforeEach(window.module('superdesk.apps.vocabularies'));
    beforeEach(window.module('superdesk.apps.searchProviders'));

    beforeEach(inject(($window) => {
        $window.onbeforeunload = angular.noop;
    }));

    beforeEach(inject((preferencesService, desks, $q) => {
        spyOn(preferencesService, 'get').and.returnValue($q.when({items: ['urn:tag:superdesk-1']}));
        spyOn(preferencesService, 'update').and.returnValue($q.when({}));
        spyOn(preferencesService, 'getPrivileges').and.returnValue($q.when({}));
        spyOn(desks, 'fetchCurrentUserDesks').and.returnValue($q.when([]));
    }));

    beforeEach(inject(($route) => {
        $route.current = {params: {_id: GUID}};
    }));

    beforeEach(inject((session) => {
        session.start({_id: 'sess'}, {_id: USER});
        expect(session.identity._id).toBe(USER);
    }));

    it('can open an item',
    inject((superdesk, api, lock, autosave, $injector, $q, $rootScope) => {
        var _item,
            lockedItem = angular.extend({_locked: false}, ITEM);

        spyOn(api, 'find').and.returnValue($q.when(ITEM));
        spyOn(lock, 'lock').and.returnValue($q.when(lockedItem));
        spyOn(autosave, 'open').and.returnValue($q.when(lockedItem));

        $injector.invoke(superdesk.activity('authoring').resolve.item).then((resolvedItem) => {
            _item = resolvedItem;
        });

        $rootScope.$digest();

        expect(api.find).toHaveBeenCalledWith('archive', GUID, jasmine.any(Object));
        expect(lock.lock).toHaveBeenCalledWith(ITEM);
        expect(autosave.open).toHaveBeenCalledWith(lockedItem);
        expect(_item.guid).toBe(GUID);
    }));

    it('does lock item only once',
    inject((superdesk, api, lock, autosave, session, $injector, $q, $rootScope) => {
        var lockedItem = ITEM;

        lockedItem.lock_user = USER;
        lockedItem.lock_session = session.sessionId;

        spyOn(api, 'find').and.returnValue($q.when(lockedItem));

        $injector.invoke(superdesk.activity('authoring').resolve.item);
        $rootScope.$digest();
        expect(ITEM._locked).toBe(true);
    }));

    it('unlocks a locked item and locks by current user',
    inject((authoring, lock, $rootScope, $timeout, api, $q, $location) => {
        spyOn(api, 'save').and.returnValue($q.when({}));
        spyOn(lock, 'unlock').and.returnValue($q.when({}));

        var lockedItem = {guid: GUID, _id: GUID, _locked: true, lock_user: 'user:5', task: 'desk:1'};
        var $scope = startAuthoring(lockedItem, 'edit');

        $rootScope.$digest();

        $scope.unlock();
        $timeout.flush(5000);
        $rootScope.$digest();
        expect($location.path(), '/authoring/' + $scope.item._id);
    }));

    it('can autosave and save an item', inject((api, $q, $timeout, $rootScope) => {
        var $scope = startAuthoring({guid: GUID, _id: GUID, task: 'desk:1', _locked: true, _editable: true},
                                    'edit'),
            headline = 'test headline';

        expect($scope.dirty).toBe(false);
        expect($scope.item.guid).toBe(GUID);
        spyOn(api, 'save').and.returnValue($q.when({headline: 'foo'}));

        // edit
        $scope.item.headline = headline;
        $scope.autosave($scope.item);
        expect($scope.dirty).toBe(true);

        // autosave
        $timeout.flush(5000);
        expect(api.save).toHaveBeenCalled();
        expect($scope.item.headline).toBe(headline);

        // save
        $scope.save();
        $rootScope.$digest();
        expect($scope.dirty).toBe(false);
        expect(api.save).toHaveBeenCalled();
    }));

    it('can use a previously created autosave', inject(() => {
        var $scope = startAuthoring({_autosave: {headline: 'test'}}, 'edit');

        expect($scope.item._autosave.headline).toBe('test');
        expect($scope.item.headline).toBe('test');
    }));

    it('can save while item is being autosaved', inject(($rootScope, $timeout, $q, api) => {
        var $scope = startAuthoring({headline: 'test', task: 'desk:1'}, 'edit');

        $scope.item.body_html = 'test';
        $rootScope.$digest();
        $timeout.flush(1000);

        spyOn(api, 'save').and.returnValue($q.when({}));
        $scope.save();
        $rootScope.$digest();

        $timeout.flush(5000);
        expect($scope.item._autosave).toBeNull();
    }));

    it('can close item after save work confirm', inject(($rootScope, $q, $location, authoring, reloadService) => {
        startAuthoring({headline: 'test'}, 'edit');
        $location.search('item', 'foo');
        $location.search('action', 'edit');
        $rootScope.$digest();

        spyOn(authoring, 'saveWorkConfirmation').and.returnValue($q.when());
        spyOn(reloadService, 'forceReload');

        $rootScope.$broadcast('savework', 'test');
        $rootScope.$digest();

        expect($location.search().item).toBe(undefined);
        expect($location.search().action).toBe(undefined);
        expect(reloadService.forceReload).toHaveBeenCalled();
    }));

    it('can populate content metadata for undo', inject(($rootScope) => {
        var orig = {headline: 'foo'};
        var scope = startAuthoring(orig, 'edit');

        expect(scope.origItem.headline).toBe('foo');
        expect(scope.item.headline).toBe('foo');
        expect(scope.item.slugline).toBe('');
        scope.$apply(() => {
            scope.origItem.headline = 'bar';
            scope.origItem.slugline = 'slug';
        });
        expect(scope.item.headline).toBe('foo');
        expect(scope.item.slugline).toBe('');
    }));

    it('confirm the associated media not called',
    inject((api, $q, $rootScope, config, confirm) => {
        let item = {
            _id: 'test',
            headline: 'headline'
        };

        let rewriteOf = {
            _id: 'rewriteOf',
            headline: 'rewrite',
            associations: {
                featuremedia: {

                }
            }
        };

        let defered = $q.defer();

        config.features = {
            editFeaturedImage: 1
        };

        spyOn(api, 'find').and.returnValue($q.when({rewriteOf}));
        spyOn(confirm, 'confirmFeatureMedia').and.returnValue(defered.promise);
        let scope = startAuthoring(item, 'edit');

        scope.publish();
        $rootScope.$digest();
        expect(confirm.confirmFeatureMedia).not.toHaveBeenCalled();
        expect(api.find).not.toHaveBeenCalledWith('archive', 'rewriteOf');
    }));

    it('confirm the associated media not called if not rewrite_of',
    inject((api, $q, $rootScope, config, confirm) => {
        let item = {
            _id: 'test',
            headline: 'headline'
        };

        let rewriteOf = {
            _id: 'rewriteOf',
            headline: 'rewrite',
            associations: {
                featuremedia: {

                }
            }
        };

        let defered = $q.defer();

        config.features = {
            editFeaturedImage: 1,
            confirmMediaOnUpdate: 1
        };

        spyOn(api, 'find').and.returnValue($q.when({rewriteOf}));
        spyOn(confirm, 'confirmFeatureMedia').and.returnValue(defered.promise);
        let scope = startAuthoring(item, 'edit');

        scope.publish();
        $rootScope.$digest();
        expect(confirm.confirmFeatureMedia).not.toHaveBeenCalled();
        expect(api.find).not.toHaveBeenCalledWith('archive', 'rewriteOf');
    }));

    it('confirm the associated media called if rewrite_of but no associated media on edited item',
    inject((api, $q, $rootScope, config, confirm, authoring) => {
        let item = {
            _id: 'test',
            headline: 'headline',
            rewrite_of: 'rewriteOf'
        };

        let rewriteOf = {
            _id: 'rewriteOf',
            headline: 'rewrite',
            associations: {
                featuremedia: {

                }
            }
        };

        let defered = $q.defer();

        config.features = {
            editFeaturedImage: 1,
            confirmMediaOnUpdate: 1
        };

        spyOn(api, 'find').and.returnValue($q.when(rewriteOf));
        spyOn(confirm, 'confirmFeatureMedia').and.returnValue(defered.promise);
        spyOn(authoring, 'autosave').and.returnValue(item);
        spyOn(authoring, 'publish').and.returnValue(item);
        let scope = startAuthoring(item, 'edit');

        scope.publish();
        $rootScope.$digest();
        expect(api.find).toHaveBeenCalledWith('archive', 'rewriteOf');
        expect(confirm.confirmFeatureMedia).toHaveBeenCalledWith(rewriteOf);
        defered.resolve(rewriteOf);
        $rootScope.$digest();
        expect(authoring.autosave).toHaveBeenCalled();
        expect(authoring.publish).not.toHaveBeenCalled();
    }));

    it('confirm the associated media but do not use the associated media',
    inject((api, $q, $rootScope, config, confirm, authoring) => {
        let item = {
            _id: 'test',
            rewrite_of: 'rewriteOf'
        };

        let rewriteOf = {
            _id: 'rewriteOf',
            associations: {
                featuremedia: {
                    test: 'test'
                }
            }
        };

        let defered = $q.defer();

        config.features = {
            editFeaturedImage: 1,
            confirmMediaOnUpdate: 1
        };

        spyOn(api, 'find').and.returnValue($q.when(rewriteOf));
        spyOn(confirm, 'confirmFeatureMedia').and.returnValue(defered.promise);
        spyOn(authoring, 'autosave').and.returnValue({});
        spyOn(authoring, 'publish').and.returnValue({});
        let scope = startAuthoring(item, 'edit');

        scope.publish();
        $rootScope.$digest();
        expect(api.find).toHaveBeenCalledWith('archive', 'rewriteOf');
        expect(confirm.confirmFeatureMedia).toHaveBeenCalledWith(rewriteOf);
        defered.resolve({});
        $rootScope.$digest();
        expect(authoring.publish).toHaveBeenCalled();
        expect(authoring.autosave).not.toHaveBeenCalled();
    }));

    /**
     * Start authoring ctrl for given item.
     *
     * @param {object} item
     * @param {string} action
     * @returns {object}
     */
    function startAuthoring(item, action) {
        var $scope;

        inject(($rootScope, $controller, superdesk, $compile) => {
            $scope = $rootScope.$new();
            $controller(superdesk.activity('authoring').controller, {
                $scope: $scope,
                item: item,
                action: action
            });
            $compile(angular.element('<div sd-authoring-workspace><div sd-authoring></div></div>'))($scope);
        });

        return $scope;
    }

    describe('authoring service', () => {
        var confirmDefer;

        beforeEach(inject((confirm, lock, $q) => {
            confirmDefer = $q.defer();
            spyOn(confirm, 'confirm').and.returnValue(confirmDefer.promise);
            spyOn(confirm, 'confirmPublish').and.returnValue(confirmDefer.promise);
            spyOn(confirm, 'confirmSaveWork').and.returnValue(confirmDefer.promise);
            spyOn(confirm, 'confirmFeatureMedia').and.returnValue(confirmDefer.promise);
            spyOn(lock, 'unlock').and.returnValue($q.when());
        }));

        it('can check if an item is editable', inject((authoring, session) => {
            expect(authoring.isEditable({})).toBe(false);
            expect(authoring.isEditable({lock_user: session.identity._id, lock_session: session.sessionId}))
                .toBe(true);
        }));

        it('can close a read-only item', inject((authoring, confirm, lock, $rootScope) => {
            var done = jasmine.createSpy('done');

            authoring.close({}).then(done);
            $rootScope.$digest();

            expect(confirm.confirm).not.toHaveBeenCalled();
            expect(lock.unlock).not.toHaveBeenCalled();
            expect(done).toHaveBeenCalled();
        }));

        it('can unlock on close editable item without changes made',
        inject((authoring, confirm, lock, $rootScope) => {
            expect(authoring.isEditable(ITEM)).toBe(true);
            authoring.close(ITEM, false);
            $rootScope.$digest();
            expect(confirm.confirm).not.toHaveBeenCalled();
            expect(lock.unlock).toHaveBeenCalled();
        }));

        it('confirms if an item is dirty and saves',
        inject((authoring, confirm, lock, $q, $rootScope) => {
            var edit = Object.create(ITEM);

            edit.headline = 'test';

            authoring.close(edit, ITEM, true);
            $rootScope.$digest();

            expect(confirm.confirm).toHaveBeenCalled();
            expect(lock.unlock).not.toHaveBeenCalled();

            spyOn(authoring, 'save').and.returnValue($q.when());
            confirmDefer.resolve();
            $rootScope.$digest();

            expect(authoring.save).toHaveBeenCalledWith(ITEM, edit);
            expect(lock.unlock).toHaveBeenCalled();
        }));

        it('confirms if an item is dirty on opening new or existing item and not unlocking on save',
        inject((authoring, confirm, lock, $q, $rootScope) => {
            var edit = Object.create(ITEM);

            edit.headline = 'test';

            authoring.close(edit, ITEM, true, true);
            $rootScope.$digest();

            expect(confirm.confirm).toHaveBeenCalled();
            expect(lock.unlock).not.toHaveBeenCalled();

            spyOn(authoring, 'save').and.returnValue($q.when());
            confirmDefer.resolve();
            $rootScope.$digest();

            expect(authoring.save).toHaveBeenCalledWith(ITEM, edit);
            expect(lock.unlock).not.toHaveBeenCalled();
        }));

        it('can unlock an item', inject((authoring, session, confirm, autosave) => {
            var item = {lock_user: session.identity._id, lock_session: session.sessionId};

            expect(authoring.isEditable(item)).toBe(true);
            spyOn(confirm, 'unlock');
            spyOn(autosave, 'stop');
            authoring.unlock(item);
            expect(authoring.isEditable(item)).toBe(false);
            expect(confirm.unlock).toHaveBeenCalled();
            expect(autosave.stop).toHaveBeenCalled();
        }));
        it('can publish items', inject((authoring, api, $q) => {
            var item = {_id: 1, state: 'submitted'};

            spyOn(api, 'update').and.returnValue($q.when());
            authoring.publish(item);
            expect(api.update).toHaveBeenCalledWith('archive_publish', item, {});
        }));

        it('confirms if an item is dirty and saves and publish',
        inject((authoring, api, confirm, lock, $q, $rootScope) => {
            var edit = Object.create(ITEM);

            _.extend(edit, {
                _id: 1,
                headline: 'test',
                lock_user: 'user:1',
                state: 'submitted'
            });

            authoring.publishConfirmation(ITEM, edit, true, 'publish');
            $rootScope.$digest();

            expect(confirm.confirmPublish).toHaveBeenCalled();
            expect(lock.unlock).not.toHaveBeenCalled();

            spyOn(api, 'update').and.returnValue($q.when(_.extend({}, edit, {})));

            authoring.publish(edit);
            $rootScope.$digest();

            expect(api.update).toHaveBeenCalledWith('archive_publish', edit, {});
            expect(lock.unlock).toHaveBeenCalled();
        }));

        it('confirms if an item is dirty and save work in personal',
        inject((authoring, api, confirm, lock, $q, $rootScope) => {
            var edit = Object.create(ITEM);

            _.extend(edit, {
                task: {desk: null, stage: null, user: 1},
                type: 'text',
                version: 1
            });

            authoring.saveWorkConfirmation(ITEM, edit, true, 'User is disabled');
            $rootScope.$digest();

            expect(confirm.confirmSaveWork).toHaveBeenCalled();

            spyOn(api, 'save').and.returnValue($q.when(_.extend({}, edit, {})));

            authoring.saveWork(edit);
            $rootScope.$digest();

            expect(api.save).toHaveBeenCalledWith('archive', {}, edit);
        }));

        it('close the published dirty item without confirmation',
        inject((authoring, api, confirm, lock, autosave, $q, $rootScope) => {
            var publishedItem = Object.create(ITEM);

            publishedItem.state = 'published';
            var edit = Object.create(publishedItem);

            edit.headline = 'test';
            spyOn(authoring, 'isEditable').and.returnValue(true);
            spyOn(autosave, 'drop').and.returnValue($q.when({}));
            authoring.close(edit, publishedItem, true, false);
            $rootScope.$digest();
            expect(confirm.confirm).not.toHaveBeenCalled();
            expect(lock.unlock).toHaveBeenCalled();
            expect(autosave.drop).toHaveBeenCalled();
        }));

        it('close the corrected dirty item without confirmation',
        inject((authoring, api, confirm, lock, autosave, $q, $rootScope) => {
            var publishedItem = Object.create(ITEM);

            publishedItem.state = 'corrected';
            var edit = Object.create(publishedItem);

            edit.headline = 'test';
            spyOn(authoring, 'isEditable').and.returnValue(true);
            spyOn(autosave, 'drop').and.returnValue($q.when({}));
            authoring.close(edit, publishedItem, true, false);
            $rootScope.$digest();
            expect(confirm.confirm).not.toHaveBeenCalled();
            expect(lock.unlock).toHaveBeenCalled();
            expect(autosave.drop).toHaveBeenCalled();
        }));

        it('can validate schedule', inject((authoring) => {
            var errors = authoring.validateSchedule('2010-10-10', '08:10:10', '2010-10-10T08:10:10', 'Europe/Prague');

            expect(errors).toBeTruthy();
            expect(errors.future).toBeTruthy();

            errors = authoring.validateSchedule('2099-10-10', '11:32:21', '2099-10-10T08:10:10', 'Europe/Prague');
            expect(errors).toBeFalsy();
        }));

        it('can validate schedule for pre utc timezone', inject((authoring, moment) => {
            // utc - 1h and matching server tz format
            var timestamp = moment.utc()
                .subtract(1, 'hours')
                .format()
                .replace('+00:00', '+0000');

            expect(authoring.validateSchedule(
                timestamp.slice(0, 10),
                timestamp.slice(11, 19),
                timestamp,
                'America/Toronto' // anything before utc
            )).toBeFalsy();
        }));

        it('updates orig item on save',
        inject((authoring, $rootScope, $httpBackend, api, $q, urls) => {
            var item = {headline: 'foo'};
            var orig = {_links: {self: {href: 'archive/foo'}}};

            spyOn(urls, 'item').and.returnValue($q.when(orig._links.self.href));
            $httpBackend.expectPATCH(orig._links.self.href, item)
                .respond(200, {_etag: 'new', _current_version: 2});
            authoring.save(orig, item);
            $rootScope.$digest();
            $httpBackend.flush();
            expect(orig._etag).toBe('new');
            expect(orig._current_version).toBe(2);
        }));
    });
});

describe('cropImage', () => {
    beforeEach(window.module('superdesk.apps.publish'));
    beforeEach(window.module('superdesk.apps.authoring'));
    beforeEach(window.module('superdesk.mocks'));
    beforeEach(window.module('superdesk.templates-cache'));
    beforeEach(window.module('superdesk.apps.vocabularies'));
    beforeEach(window.module('superdesk.apps.searchProviders'));

    it('can change button label for apply/edit crop',
    inject(($rootScope, $compile, $q, metadata) => {
        var metaInit = $q.defer();

        metadata.values = {
            crop_sizes: [
                {name: '4-3'}, {name: '16-9'}
            ]
        };

        spyOn(metadata, 'initialize').and.returnValue(metaInit.promise);

        var elem = $compile('<div sd-article-edit></div>')($rootScope.$new());
        var scope = elem.scope();

        scope.item = {
            type: 'picture',
            renditions: {
            }
        };

        metaInit.resolve();
        scope.$digest();

        expect(scope.item.hasCrops).toBe(false);

        elem = $compile('<div sd-article-edit></div>')($rootScope.$new());
        scope = elem.scope();

        scope.item = {
            type: 'picture',
            renditions: {
                '4-3': {
                }
            }
        };

        metaInit.resolve();
        scope.$digest();

        expect(scope.item.hasCrops).toBe(true);
    }));
});

describe('autosave', () => {
    beforeEach(window.module('superdesk.apps.authoring'));
    beforeEach(window.module('superdesk.mocks'));
    beforeEach(window.module('superdesk.templates-cache'));
    beforeEach(window.module('superdesk.apps.searchProviders'));

    it('can fetch an autosave for item locked by user and is editable',
        inject((autosave, api, $q, $rootScope) => {
            spyOn(api, 'find').and.returnValue($q.when({}));
            autosave.open({_locked: true, _editable: true, _id: 1});
            $rootScope.$digest();
            expect(api.find).toHaveBeenCalledWith('archive_autosave', 1);
        }));

    it('will skip autosave fetch when item is locked by user but not editable',
        inject((autosave, api, $q, $rootScope) => {
            spyOn(api, 'find').and.returnValue($q.when({}));
            autosave.open({_locked: false, _editable: false, _id: 1});
            $rootScope.$digest();
            expect(api.find).not.toHaveBeenCalled();
        }));

    it('will skip autosave fetch when item is locked by another user',
        inject((autosave, api, $rootScope) => {
            spyOn(api, 'find');
            autosave.open({_locked: true});
            $rootScope.$digest();
            expect(api.find).not.toHaveBeenCalled();
        }));

    it('can create an autosave', inject((autosave, api, $q, $timeout, $rootScope) => {
        var orig = {_id: 1, _etag: 'x', _locked: true, _editable: true};
        var item = Object.create(orig);

        item.headline = 'test';
        spyOn(api, 'save').and.returnValue($q.when({_id: 2}));
        autosave.save(item, orig);
        $rootScope.$digest();
        expect(api.save).not.toHaveBeenCalled();
        $timeout.flush(5000);
        expect(api.save).toHaveBeenCalledWith('archive_autosave', {}, {_id: 1, headline: 'test'});
        expect(orig._autosave._id).toBe(2);
        expect(item.headline).toBe('test');
        expect(orig.headline).not.toBe('test');
    }));

    it('can save multiple items', inject((autosave, api, $q, $timeout, $rootScope) => {
        var item1 = {_id: 1, _etag: '1', _locked: true, _editable: true},
            item2 = {_id: 2, _etag: '2', _locked: true, _editable: true};

        spyOn(api, 'save').and.returnValue($q.when({}));

        autosave.save(_.create(item1), item1);
        $timeout.flush(1500);

        autosave.save(_.create(item2), item2);
        $timeout.flush(2500);

        expect(api.save).toHaveBeenCalled();
        expect(api.save.calls.count()).toBe(1);

        $timeout.flush(5000);
        expect(api.save.calls.count()).toBe(2);
    }));
});

describe('lock service', () => {
    beforeEach(window.module('superdesk.apps.authoring'));
    beforeEach(window.module('superdesk.mocks'));
    beforeEach(window.module('superdesk.templates-cache'));
    beforeEach(window.module('superdesk.apps.searchProviders'));

    var user = {_id: 'user'};
    var sess = {_id: 'sess'};
    var anotherUser = {_id: 'another_user'};

    beforeEach(inject((session) => {
        session.start(sess, user);
    }));

    it('can test if item is locked', inject((lock) => {
        expect(lock.isLocked({})).toBe(false);
        expect(lock.isLocked({lock_user: '1'})).toBe(true);
    }));

    it('can detect lock by same user and different session', inject((lock) => {
        expect(lock.isLocked({lock_user: 'user'})).toBe(true);
        expect(lock.isLocked({lock_user: 'user', lock_session: 'other_sess'})).toBe(true);
    }));

    it('can use lock_user dict', inject((lock, session) => {
        expect(lock.isLocked({lock_user: {_id: 'user'}})).toBe(true);
        expect(lock.isLocked({lock_user: {_id: 'user'}, lock_session: session.sessionId})).toBe(false);
    }));

    it('can unlock the item if user has unlock privileges', inject((lock, privileges, $rootScope) => {
        privileges.setUserPrivileges({unlock: 1});
        $rootScope.$digest();
        // testing if the user can unlock its own content.
        expect(lock.can_unlock({lock_user: user._id})).toBe(true);
        expect(lock.can_unlock({lock_user: user._id, lock_session: 'another_session'})).toBe(true);
        expect(lock.can_unlock({lock_user: anotherUser._id, lock_session: 'another_session'})).toBe(1);
    }));

    it('can unlock the item if user has no unlock privileges', inject((lock, privileges, $rootScope) => {
        privileges.setUserPrivileges({unlock: 0});
        $rootScope.$digest();
        // testing if the user can unlock its own content.
        expect(lock.can_unlock({lock_user: user._id})).toBe(true);
        expect(lock.can_unlock({lock_user: user._id, lock_session: 'another_session'})).toBe(true);
        expect(lock.can_unlock({lock_user: anotherUser._id, lock_session: 'another_session'})).toBe(0);
    }));

    it('can unlock own draft but not other users item', inject((lock, privileges, $rootScope) => {
        privileges.setUserPrivileges({unlock: 1});
        $rootScope.$digest();
        // testing if the user can unlock its own content.
        expect(lock.can_unlock({lock_user: user._id, state: 'draft'})).toBe(true);
        expect(lock.can_unlock({lock_user: user._id, state: 'draft', lock_session: 'another_session'})).toBe(true);
        var item = {lock_user: anotherUser._id, state: 'draft', lock_session: 'another_session'};

        expect(lock.can_unlock(item)).toBe(false);
    }));
});

describe('authoring actions', () => {
    var userDesks = [{_id: 'desk1'}, {_id: 'desk2'}];

    /**
     * Assert the actions
     *
     * @param {Object} actions : actions to be asserted.
     * @param {string[]} keys : keys to be truthy.
     */
    function allowedActions(actions, keys) {
        _.forOwn(actions, (value, key) => {
            if (_.includes(keys, key)) {
                expect(value).toBeTruthy();
            } else {
                expect(value).toBeFalsy();
            }
        });
    }

    beforeEach(window.module('superdesk.apps.authoring'));
    beforeEach(window.module('superdesk.mocks'));
    beforeEach(window.module('superdesk.apps.desks'));
    beforeEach(window.module('superdesk.templates-cache'));
    beforeEach(window.module('superdesk.apps.searchProviders'));

    beforeEach(inject((desks, $q) => {
        spyOn(desks, 'fetchCurrentUserDesks').and.returnValue($q.when(userDesks));
    }));

    it('can perform actions if the item is located on the personal workspace',
        inject((privileges, desks, authoring, $q, $rootScope) => {
            var item = {
                _id: 'test',
                state: 'draft',
                flags: {marked_for_not_publication: false},
                type: 'text'
            };

            var userPrivileges = {
                duplicate: true,
                mark_item: false,
                spike: true,
                unspike: true,
                mark_for_highlights: true,
                unlock: true
            };

            privileges.setUserPrivileges(userPrivileges);
            $rootScope.$digest();
            var itemActions = authoring.itemActions(item);

            allowedActions(itemActions, ['save', 'edit', 'copy', 'spike', 'multi_edit']);
        }));

    it('can perform actions if the item is located on the desk',
        inject((privileges, desks, authoring, $q, $rootScope) => {
            var item = {
                _id: 'test',
                state: 'submitted',
                flags: {marked_for_not_publication: false},
                type: 'text',
                task: {
                    desk: 'desk1'
                },
                _current_version: 1
            };

            var userPrivileges = {
                duplicate: true,
                mark_item: false,
                spike: true,
                unspike: true,
                mark_for_highlights: true,
                mark_for_desks: true,
                unlock: true,
                publish: true
            };

            privileges.setUserPrivileges(userPrivileges);
            $rootScope.$digest();
            var itemActions = authoring.itemActions(item);

            allowedActions(itemActions, ['new_take', 'save', 'edit', 'duplicate', 'spike', 're_write',
                'mark_item_for_highlight', 'mark_item_for_desks',
                'package_item', 'multi_edit', 'publish', 'add_to_current']);
        }));

    it('cannot perform publish if the item is marked for not publication',
        inject((privileges, desks, authoring, $q, $rootScope) => {
            var item = {
                _id: 'test',
                state: 'submitted',
                flags: {marked_for_not_publication: true},
                type: 'text',
                task: {
                    desk: 'desk1'
                },
                _current_version: 1
            };

            var userPrivileges = {
                duplicate: true,
                mark_item: false,
                spike: true,
                unspike: true,
                mark_for_highlights: true,
                unlock: true,
                publish: true
            };

            privileges.setUserPrivileges(userPrivileges);
            $rootScope.$digest();
            var itemActions = authoring.itemActions(item);

            allowedActions(itemActions, ['new_take', 'save', 'edit', 'duplicate', 'spike', 're_write',
                'mark_item_for_highlight', 'package_item', 'multi_edit', 'add_to_current']);
        }));

    it('cannot perform publish if the item is highlight package',
        inject((privileges, desks, authoring, $q, $rootScope) => {
            var item = {
                _id: 'test',
                state: 'submitted',
                type: 'composite',
                highlight: 1,
                task: {
                    desk: 'desk1'
                },
                _current_version: 1
            };

            var userPrivileges = {
                duplicate: true,
                mark_item: false,
                spike: true,
                unspike: true,
                mark_for_highlights: true,
                unlock: true,
                publish: true
            };

            privileges.setUserPrivileges(userPrivileges);
            $rootScope.$digest();
            var itemActions = authoring.itemActions(item);

            allowedActions(itemActions, ['save', 'edit', 'duplicate', 'spike',
                'mark_item_for_highlight', 'package_item', 'multi_edit', 'add_to_current']);
        }));

    it('cannot publish if user does not have publish privileges on the desk',
        inject((privileges, desks, authoring, $q, $rootScope) => {
            var item = {
                _id: 'test',
                state: 'submitted',
                flags: {marked_for_not_publication: false},
                type: 'text',
                task: {
                    desk: 'desk1'
                },
                _current_version: 1
            };

            var userPrivileges = {
                duplicate: true,
                mark_item: false,
                spike: true,
                unspike: true,
                mark_for_highlights: true,
                unlock: true,
                publish: false
            };

            privileges.setUserPrivileges(userPrivileges);
            $rootScope.$digest();
            var itemActions = authoring.itemActions(item);

            allowedActions(itemActions, ['new_take', 'save', 'edit', 'duplicate', 'spike', 're_write',
                'mark_item_for_highlight', 'package_item', 'multi_edit', 'add_to_current']);
        }));

    it('can only view the item if the user does not have desk membership',
        inject((privileges, desks, authoring, $q, $rootScope) => {
            var item = {
                _id: 'test',
                state: 'submitted',
                flags: {marked_for_not_publication: false},
                type: 'text',
                task: {
                    desk: 'desk3'
                },
                _current_version: 2
            };

            var userPrivileges = {
                duplicate: true,
                mark_item: false,
                spike: true,
                unspike: true,
                mark_for_highlights: true,
                mark_for_desks: false,
                unlock: true,
                archive: true
            };

            privileges.setUserPrivileges(userPrivileges);
            $rootScope.$digest();
            var itemActions = authoring.itemActions(item);

            allowedActions(itemActions, ['view', 're_write', 'new_take']);
        }));

    it('can only view the item if the item is killed',
        inject((privileges, desks, authoring, $q, $rootScope) => {
            var item = {
                _id: 'test',
                state: 'killed',
                flags: {marked_for_not_publication: false},
                type: 'text',
                task: {
                    desk: 'desk1'
                }
            };

            var userPrivileges = {
                duplicate: true,
                mark_item: false,
                spike: true,
                unspike: true,
                mark_for_highlights: true,
                unlock: true
            };

            privileges.setUserPrivileges(userPrivileges);
            $rootScope.$digest();
            var itemActions = authoring.itemActions(item);

            allowedActions(itemActions, ['view']);
        }));

    it('cannot create an update for a rewritten story ',
        inject((privileges, desks, authoring, $q, $rootScope) => {
            var item = {
                _id: 'test',
                state: 'published',
                type: 'text',
                rewritten_by: 1,
                task: {
                    desk: 'desk1'
                }
            };

            var userPrivileges = {
                archive: true,
                rewrite: true,
                unlock: true
            };

            privileges.setUserPrivileges(userPrivileges);
            $rootScope.$digest();
            var itemActions = authoring.itemActions(item);

            allowedActions(itemActions, ['view', 'package_item', 'multi_edit', 'add_to_current', 'resend']);
        }));

    it('can only view item if the item is spiked',
        inject((privileges, desks, authoring, $q, $rootScope) => {
            var item = {
                _id: 'test',
                state: 'spiked',
                flags: {marked_for_not_publication: false},
                type: 'text',
                task: {
                    desk: 'desk1'
                }
            };

            var userPrivileges = {
                duplicate: true,
                mark_item: false,
                spike: true,
                unspike: true,
                mark_for_highlights: true,
                unlock: true
            };

            privileges.setUserPrivileges(userPrivileges);
            $rootScope.$digest();
            var itemActions = authoring.itemActions(item);

            allowedActions(itemActions, ['view', 'unspike']);
        }));

    it('Cannot perform new take if more coming is true or take is not last take on the desk',
        inject((privileges, desks, authoring, $q, $rootScope) => {
            var item = {
                _id: 'test',
                state: 'in_progress',
                flags: {marked_for_not_publication: false},
                type: 'text',
                task: {
                    desk: 'desk1'
                }
            };

            var userPrivileges = {
                duplicate: true,
                mark_item: false,
                spike: true,
                unspike: true,
                mark_for_highlights: true,
                unlock: true,
                publish: true
            };

            privileges.setUserPrivileges(userPrivileges);
            $rootScope.$digest();
            var itemActions = authoring.itemActions(item);

            allowedActions(itemActions, ['save', 'edit', 'duplicate', 'spike',
                'mark_item_for_highlight', 'package_item', 'multi_edit', 'publish', 'add_to_current']);

            item = {
                _id: 'test',
                state: 'in_progress',
                flags: {marked_for_not_publication: false},
                type: 'text',
                task: {
                    desk: 'desk1'
                },
                takes: {
                    last_take: 'take2'
                }
            };

            itemActions = authoring.itemActions(item);
            allowedActions(itemActions, ['save', 'edit', 'duplicate',
                'mark_item_for_highlight', 'package_item', 'multi_edit', 'publish', 'add_to_current']);
        }));

    it('Can perform new take',
        inject((privileges, desks, authoring, $q, $rootScope) => {
            var item = {
                _id: 'test',
                state: 'in_progress',
                flags: {marked_for_not_publication: false},
                type: 'text',
                task: {
                    desk: 'desk1'
                },
                _current_version: 1
            };

            var userPrivileges = {
                duplicate: true,
                mark_item: false,
                spike: true,
                unspike: true,
                mark_for_highlights: true,
                unlock: true,
                publish: true,
                correct: true,
                kill: true,
                resend: true
            };

            privileges.setUserPrivileges(userPrivileges);
            $rootScope.$digest();
            var itemActions = authoring.itemActions(item);

            allowedActions(itemActions, ['new_take', 'save', 'edit', 'duplicate', 'spike', 're_write',
                'mark_item_for_highlight', 'package_item', 'multi_edit', 'publish', 'add_to_current']);

            item = {
                _id: 'test',
                state: 'published',
                marked_for_not_publication: false,
                type: 'text',
                _current_version: 1,
                task: {
                    desk: 'desk1'
                },
                archive_item: {
                    _id: 'test',
                    state: 'published',
                    flags: {marked_for_not_publication: false},
                    type: 'text',
                    task: {
                        desk: 'desk1'
                    },
                    takes: {
                        last_take: 'test'
                    },
                    _current_version: 1
                }
            };

            itemActions = authoring.itemActions(item);
            allowedActions(itemActions, ['new_take', 'duplicate', 'view', 'add_to_current',
                'mark_item_for_highlight', 'package_item', 'multi_edit', 'correct', 'kill', 're_write', 'resend']);
        }));

    it('Can perform correction or kill on published item',
        inject((privileges, desks, authoring, $q, $rootScope) => {
            var item = {
                _id: 'test',
                state: 'published',
                flags: {marked_for_not_publication: false},
                type: 'text',
                task: {
                    desk: 'desk1'
                },
                _current_version: 10,
                archive_item: {
                    _id: 'test',
                    state: 'published',
                    marked_for_not_publication: false,
                    type: 'text',
                    task: {
                        desk: 'desk1'
                    },
                    _current_version: 10
                }
            };

            var userPrivileges = {
                duplicate: true,
                mark_item: false,
                spike: true,
                unspike: true,
                mark_for_highlights: true,
                unlock: true,
                publish: true,
                correct: true,
                kill: true,
                archive_broadcast: true
            };

            privileges.setUserPrivileges(userPrivileges);
            $rootScope.$digest();
            var itemActions = authoring.itemActions(item);

            allowedActions(itemActions, ['new_take', 'duplicate', 'view', 'add_to_current',
                'mark_item_for_highlight', 'package_item', 'multi_edit', 'correct', 'kill', 're_write',
                'create_broadcast', 'resend']);
        }));

    it('Can perform resend on rewritten item',
        inject((privileges, desks, authoring, $q, $rootScope) => {
            var item = {
                _id: 'test',
                state: 'published',
                flags: {marked_for_not_publication: false},
                type: 'text',
                task: {
                    desk: 'desk1'
                },
                _current_version: 10,
                archive_item: {
                    _id: 'test',
                    state: 'published',
                    marked_for_not_publication: false,
                    type: 'text',
                    task: {
                        desk: 'desk1'
                    },
                    _current_version: 10
                }
            };

            var userPrivileges = {
                duplicate: true,
                mark_item: false,
                spike: true,
                unspike: true,
                mark_for_highlights: true,
                unlock: true,
                publish: true,
                correct: true,
                kill: true,
                archive_broadcast: true
            };

            privileges.setUserPrivileges(userPrivileges);
            $rootScope.$digest();
            var itemActions = authoring.itemActions(item);

            allowedActions(itemActions, ['new_take', 'duplicate', 'view', 'add_to_current',
                'mark_item_for_highlight', 'package_item', 'multi_edit', 'correct', 'kill', 're_write',
                'create_broadcast', 'resend']);

            item.archive_item.rewritten_by = 'abc';
            itemActions = authoring.itemActions(item);
            allowedActions(itemActions, ['duplicate', 'view', 'add_to_current', 'mark_item_for_highlight',
                'package_item', 'multi_edit', 'correct', 'kill', 'create_broadcast', 'resend']);
        }));

    it('Cannot perform correction or kill on published item without privileges',
        inject((privileges, desks, authoring, $q, $rootScope) => {
            var item = {
                _id: 'test',
                state: 'published',
                flags: {marked_for_not_publication: false},
                type: 'text',
                task: {
                    desk: 'desk1'
                },
                _current_version: 10,
                archive_item: {
                    _id: 'test',
                    state: 'published',
                    flags: {marked_for_not_publication: false},
                    type: 'text',
                    task: {
                        desk: 'desk1'
                    },
                    _current_version: 10
                }
            };

            var userPrivileges = {
                duplicate: true,
                mark_item: false,
                spike: true,
                unspike: true,
                mark_for_highlights: true,
                unlock: true,
                publish: true,
                correct: false,
                kill: false
            };

            privileges.setUserPrivileges(userPrivileges);
            $rootScope.$digest();
            var itemActions = authoring.itemActions(item);

            allowedActions(itemActions, ['new_take', 'duplicate', 'view', 'add_to_current',
                'mark_item_for_highlight', 'package_item', 'multi_edit', 're_write', 'resend']);
        }));

    it('Can only view if the item is not the current version',
        inject((privileges, desks, authoring, $q, $rootScope) => {
            var item = {
                _id: 'test',
                state: 'published',
                flags: {marked_for_not_publication: false},
                type: 'text',
                task: {
                    desk: 'desk1'
                },
                _current_version: 8,
                archive_item: {
                    _id: 'test',
                    state: 'published',
                    flags: {marked_for_not_publication: false},
                    type: 'text',
                    task: {
                        desk: 'desk1'
                    },
                    _current_version: 10
                }
            };

            var userPrivileges = {
                duplicate: true,
                mark_item: false,
                spike: true,
                unspike: true,
                mark_for_highlights: true,
                unlock: true,
                publish: true,
                correct: true,
                kill: true
            };

            privileges.setUserPrivileges(userPrivileges);
            $rootScope.$digest();
            var itemActions = authoring.itemActions(item);

            allowedActions(itemActions, ['view']);
        }));

    it('Can only view, duplicate and deschedule if the item is scheduled',
        inject((privileges, desks, authoring, $q, $rootScope) => {
            var item = {
                _id: 'test',
                state: 'scheduled',
                flags: {marked_for_not_publication: false},
                type: 'text',
                task: {
                    desk: 'desk1'
                },
                _current_version: 8,
                archive_item: {
                    _id: 'test',
                    state: 'scheduled',
                    flags: {marked_for_not_publication: false},
                    type: 'text',
                    task: {
                        desk: 'desk1'
                    },
                    _current_version: 8
                }
            };

            var userPrivileges = {
                duplicate: true,
                mark_item: false,
                spike: true,
                unspike: true,
                mark_for_highlights: true,
                unlock: true,
                publish: true,
                correct: true,
                kill: true
            };

            privileges.setUserPrivileges(userPrivileges);
            $rootScope.$digest();
            var itemActions = authoring.itemActions(item);

            allowedActions(itemActions, ['view', 'duplicate', 'deschedule']);
        }));

    it('Can only package if the item is not a take package',
        inject((privileges, desks, authoring, $q, $rootScope) => {
            var item = {
                _id: 'test',
                state: 'published',
                flags: {marked_for_not_publication: false},
                type: 'text',
                task: {
                    desk: 'desk1'
                },
                _current_version: 8,
                archive_item: {
                    _id: 'test',
                    state: 'published',
                    flags: {marked_for_not_publication: false},
                    type: 'text',
                    task: {
                        desk: 'desk1'
                    },
                    _current_version: 8
                }
            };

            var userPrivileges = {
                duplicate: true,
                mark_item: false,
                spike: true,
                unspike: true,
                mark_for_highlights: true,
                unlock: true,
                publish: true,
                correct: true,
                kill: true,
                package_item: false
            };

            privileges.setUserPrivileges(userPrivileges);
            $rootScope.$digest();
            var itemActions = authoring.itemActions(item);

            allowedActions(itemActions, ['correct', 'kill', 'new_take', 're_write', 'add_to_current',
                'mark_item_for_highlight', 'duplicate', 'view', 'package_item', 'multi_edit', 'resend']);
        }));

    it('Cannot send item if the version is zero',
        inject((privileges, desks, authoring, $q, $rootScope) => {
            var item = {
                _id: 'test',
                state: 'in_progress',
                flags: {marked_for_not_publication: false},
                type: 'text',
                task: {
                    desk: 'desk1'
                },
                _current_version: 0
            };

            var userPrivileges = {
                duplicate: true,
                mark_item: false,
                spike: true,
                unspike: true,
                mark_for_highlights: true,
                unlock: true,
                publish: true,
                correct: true,
                kill: true,
                package_item: false,
                move: true
            };

            privileges.setUserPrivileges(userPrivileges);
            $rootScope.$digest();
            var itemActions = authoring.itemActions(item);

            allowedActions(itemActions, ['save', 'edit', 'duplicate', 'spike', 'add_to_current',
                'mark_item_for_highlight', 'package_item', 'multi_edit', 'publish']);
        }));

    it('Cannot perform new take if the version is zero',
        inject((privileges, desks, authoring, $q, $rootScope) => {
            var item = {
                _id: 'test',
                state: 'in_progress',
                flags: {marked_for_not_publication: false},
                type: 'text',
                task: {
                    desk: 'desk1'
                },
                _current_version: 0
            };

            var userPrivileges = {
                duplicate: true,
                mark_item: false,
                spike: true,
                unspike: true,
                mark_for_highlights: true,
                unlock: true,
                publish: true,
                correct: true,
                kill: true,
                package_item: false,
                move: true
            };

            privileges.setUserPrivileges(userPrivileges);
            $rootScope.$digest();
            var itemActions = authoring.itemActions(item);

            allowedActions(itemActions, ['save', 'edit', 'duplicate', 'spike', 'add_to_current',
                'mark_item_for_highlight', 'package_item', 'multi_edit', 'publish']);
        }));

    it('Cannot send item if the no move privileges',
        inject((privileges, desks, authoring, $q, $rootScope) => {
            var item = {
                _id: 'test',
                state: 'in_progress',
                flags: {marked_for_not_publication: false},
                type: 'text',
                task: {
                    desk: 'desk1'
                },
                _current_version: 1
            };

            var userPrivileges = {
                duplicate: true,
                mark_item: false,
                spike: true,
                unspike: true,
                mark_for_highlights: true,
                unlock: true,
                publish: true,
                correct: true,
                kill: true,
                package_item: false,
                move: false
            };

            privileges.setUserPrivileges(userPrivileges);
            $rootScope.$digest();
            var itemActions = authoring.itemActions(item);

            allowedActions(itemActions, ['new_take', 'save', 'edit', 'duplicate', 'spike', 'add_to_current',
                're_write', 'mark_item_for_highlight', 'package_item', 'multi_edit', 'publish']);
        }));

    it('Can send item if the version greater then zero',
        inject((privileges, desks, authoring, $q, $rootScope) => {
            var item = {
                _id: 'test',
                state: 'in_progress',
                flags: {marked_for_not_publication: false},
                type: 'text',
                task: {
                    desk: 'desk1'
                },
                _current_version: 1
            };

            var userPrivileges = {
                duplicate: true,
                mark_item: false,
                spike: true,
                unspike: true,
                mark_for_highlights: true,
                unlock: true,
                publish: true,
                correct: true,
                kill: true,
                package_item: false,
                move: true
            };

            privileges.setUserPrivileges(userPrivileges);
            $rootScope.$digest();
            var itemActions = authoring.itemActions(item);

            allowedActions(itemActions, ['new_take', 'save', 'edit', 'duplicate', 'spike', 'add_to_current',
                're_write', 'mark_item_for_highlight', 'package_item', 'multi_edit', 'publish', 'send']);
        }));

    it('Cannot do new take for embargo item.',
        inject((privileges, desks, authoring, $q, $rootScope) => {
            var item = {
                _id: 'test',
                state: 'in_progress',
                flags: {marked_for_not_publication: false},
                type: 'text',
                task: {
                    desk: 'desk1'
                },
                _current_version: 1,
                embargo: Date()
            };

            var userPrivileges = {
                duplicate: true,
                mark_item: false,
                spike: true,
                unspike: true,
                mark_for_highlights: true,
                unlock: true,
                publish: true,
                correct: true,
                kill: true,
                package_item: true,
                move: true
            };

            privileges.setUserPrivileges(userPrivileges);
            $rootScope.$digest();
            var itemActions = authoring.itemActions(item);

            allowedActions(itemActions, ['save', 'edit', 'duplicate', 'spike', 'add_to_current',
                'mark_item_for_highlight', 'multi_edit', 'publish', 'send']);
        }));

    it('Cannot do new take for scheduled item.',
        inject((privileges, desks, authoring, $q, $rootScope) => {
            var item = {
                _id: 'test',
                state: 'in_progress',
                flags: {marked_for_not_publication: false},
                type: 'text',
                task: {
                    desk: 'desk1'
                },
                _current_version: 1,
                publish_schedule: Date()
            };

            var userPrivileges = {
                duplicate: true,
                mark_item: false,
                spike: true,
                unspike: true,
                mark_for_highlights: true,
                unlock: true,
                publish: true,
                correct: true,
                kill: true,
                package_item: true,
                move: true
            };

            privileges.setUserPrivileges(userPrivileges);
            $rootScope.$digest();
            var itemActions = authoring.itemActions(item);

            allowedActions(itemActions, ['save', 'edit', 'duplicate', 'spike', 'add_to_current',
                'mark_item_for_highlight', 'multi_edit', 'publish', 'send']);
        }));

    it('Can do new take, rewrite and package item for scheduled item after passing publish schedule.',
        inject((privileges, desks, authoring, $q, $rootScope) => {
            var pastTimestamp = new Date();

            pastTimestamp.setHours(pastTimestamp.getHours() - 1);

            var item = {
                _id: 'test',
                state: 'published',
                flags: {marked_for_not_publication: false},
                type: 'text',
                task: {
                    desk: 'desk1'
                },
                _current_version: 2,
                publish_schedule: pastTimestamp
            };

            var userPrivileges = {
                duplicate: true,
                mark_item: false,
                spike: true,
                unspike: true,
                mark_for_highlights: true,
                unlock: true,
                publish: true,
                correct: true,
                kill: true,
                package_item: true,
                move: true
            };

            privileges.setUserPrivileges(userPrivileges);
            $rootScope.$digest();
            var itemActions = authoring.itemActions(item);

            allowedActions(itemActions, ['correct', 'kill', 'duplicate', 'add_to_current', 'new_take', 're_write',
                'view', 'package_item', 'mark_item_for_highlight', 'multi_edit', 'resend']);
        }));

    it('Create broadcast icon is available for text item.',
        inject((privileges, desks, authoring, $q, $rootScope) => {
            var item = {
                _id: 'test',
                state: 'published',
                flags: {marked_for_not_publication: false},
                type: 'text',
                task: {
                    desk: 'desk1'
                },
                _current_version: 10,
                genre: [],
                archive_item: {
                    _id: 'test',
                    state: 'published',
                    flags: {marked_for_not_publication: false},
                    type: 'text',
                    task: {
                        desk: 'desk1'
                    },
                    _current_version: 10,
                    genre: []
                }
            };

            var userPrivileges = {
                duplicate: true,
                mark_item: false,
                spike: true,
                unspike: true,
                mark_for_highlights: true,
                unlock: true,
                publish: true,
                correct: true,
                kill: true,
                archive_broadcast: true
            };

            privileges.setUserPrivileges(userPrivileges);
            $rootScope.$digest();
            var itemActions = authoring.itemActions(item);

            allowedActions(itemActions, ['duplicate', 'new_take', 're_write', 'mark_item_for_highlight', 'multi_edit',
                'correct', 'kill', 'package_item', 'view', 'create_broadcast', 'add_to_current', 'resend']);
        }));

    it('Create broadcast icon is available for text item with genre Article.',
        inject((privileges, desks, authoring, $q, $rootScope) => {
            var item = {
                _id: 'test',
                state: 'published',
                flags: {marked_for_not_publication: false},
                type: 'text',
                task: {
                    desk: 'desk1'
                },
                _current_version: 10,
                genre: [{name: 'Article', value: 'Article'}],
                archive_item: {
                    _id: 'test',
                    state: 'published',
                    flags: {marked_for_not_publication: false},
                    type: 'text',
                    task: {
                        desk: 'desk1'
                    },
                    _current_version: 10,
                    genre: [{name: 'Article', value: 'Article'}]
                }
            };

            var userPrivileges = {
                duplicate: true,
                mark_item: false,
                spike: true,
                unspike: true,
                mark_for_highlights: true,
                unlock: true,
                publish: true,
                correct: true,
                kill: true,
                archive_broadcast: true
            };

            privileges.setUserPrivileges(userPrivileges);
            $rootScope.$digest();
            var itemActions = authoring.itemActions(item);

            allowedActions(itemActions, ['duplicate', 'new_take', 're_write', 'mark_item_for_highlight', 'multi_edit',
                'correct', 'kill', 'package_item', 'view', 'create_broadcast', 'add_to_current', 'resend']);
        }));

    it('Create broadcast icon is not available for broadcast item',
        inject((privileges, desks, authoring, $q, $rootScope) => {
            var item = {
                _id: 'test',
                state: 'published',
                flags: {marked_for_not_publication: false},
                type: 'text',
                task: {
                    desk: 'desk1'
                },
                _current_version: 10,
                genre: [
                    {name: 'Interview', value: 'Interview'},
                    {name: 'Broadcast Script', value: 'Broadcast Script'}
                ],
                archive_item: {
                    _id: 'test',
                    state: 'published',
                    flags: {marked_for_not_publication: false},
                    type: 'text',
                    task: {
                        desk: 'desk1'
                    },
                    _current_version: 10,
                    genre: [
                        {name: 'Interview', value: 'Interview'},
                        {name: 'Broadcast Script', value: 'Broadcast Script'}
                    ]
                }
            };

            var userPrivileges = {
                duplicate: true,
                mark_item: false,
                spike: true,
                unspike: true,
                mark_for_highlights: true,
                unlock: true,
                publish: true,
                correct: true,
                kill: true,
                archive_broadcast: true
            };

            privileges.setUserPrivileges(userPrivileges);
            $rootScope.$digest();
            var itemActions = authoring.itemActions(item);

            allowedActions(itemActions, ['duplicate', 'mark_item_for_highlight', 'multi_edit',
                'correct', 'kill', 'package_item', 'view', 'add_to_current', 'resend']);
        }));

    it('takes package is in published state.',
        inject((privileges, desks, authoring, $q, $rootScope) => {
            var item = {
                _id: 'test',
                state: 'published',
                flags: {marked_for_not_publication: false},
                type: 'composite',
                package_type: 'takes',
                task: {
                    desk: 'desk1'
                },
                _current_version: 1,
                genre: [
                    {name: 'Interview', value: 'Interview'}
                ],
                archive_item: {
                    _id: 'test',
                    state: 'published',
                    flags: {marked_for_not_publication: false},
                    type: 'composite',
                    package_type: 'takes',
                    task: {
                        desk: 'desk1'
                    },
                    _current_version: 1,
                    genre: [
                        {name: 'Interview', value: 'Interview'}
                    ]
                }
            };

            var userPrivileges = {
                archive_broadcast: true
            };

            privileges.setUserPrivileges(userPrivileges);
            $rootScope.$digest();
            var itemActions = authoring.itemActions(item);

            allowedActions(itemActions, ['view', 'add_to_current']);
        }));

    it('takes package is in scheduled state.',
        inject((privileges, desks, authoring, $q, $rootScope) => {
            var item = {
                _id: 'test',
                state: 'scheduled',
                flags: {marked_for_not_publication: false},
                type: 'composite',
                package_type: 'takes',
                task: {
                    desk: 'desk1'
                },
                _current_version: 1,
                genre: [],
                archive_item: {
                    _id: 'test',
                    state: 'scheduled',
                    flags: {marked_for_not_publication: false},
                    type: 'composite',
                    package_type: 'takes',
                    task: {
                        desk: 'desk1'
                    },
                    _current_version: 1,
                    genre: []
                }
            };

            var userPrivileges = {
                archive_broadcast: true
            };

            privileges.setUserPrivileges(userPrivileges);
            $rootScope.$digest();
            var itemActions = authoring.itemActions(item);

            allowedActions(itemActions, ['view']);
        }));

    it('rewrite is not allowed if re-written item exists.',
        inject((privileges, desks, authoring, $q, $rootScope) => {
            var item = {
                _id: 'test',
                state: 'published',
                flags: {marked_for_not_publication: false},
                type: 'text',
                task: {
                    desk: 'desk1'
                },
                _current_version: 10,
                rewritten_by: '123',
                genre: [
                    {name: 'Interview', value: 'Interview'}
                ],
                archive_item: {
                    _id: 'test',
                    state: 'published',
                    flags: {marked_for_not_publication: false},
                    type: 'text',
                    task: {
                        desk: 'desk1'
                    },
                    _current_version: 10,
                    rewritten_by: '123',
                    genre: [
                        {name: 'Interview', value: 'Interview'}
                    ]
                }
            };

            var userPrivileges = {
                duplicate: true,
                mark_item: false,
                spike: true,
                unspike: true,
                mark_for_highlights: true,
                unlock: true,
                publish: true,
                correct: true,
                kill: true,
                archive_broadcast: true
            };

            privileges.setUserPrivileges(userPrivileges);
            $rootScope.$digest();
            var itemActions = authoring.itemActions(item);

            allowedActions(itemActions, ['duplicate', 'mark_item_for_highlight', 'multi_edit', 'create_broadcast',
                'correct', 'kill', 'package_item', 'view', 'add_to_current', 'resend']);
        }));
});

describe('authoring workspace', () => {
    var item, lockedItem;

    beforeEach(() => {
        item = {_id: 'foo', type: 'text'};
        lockedItem = {_id: item._id, _editable: true};
    });

    beforeEach(window.module('superdesk.apps.authoring'));
    beforeEach(window.module('superdesk.apps.searchProviders'));

    beforeEach(inject(($q, authoring) => {
        spyOn(authoring, 'open').and.returnValue($q.when(lockedItem));
    }));

    it('can edit item', inject((superdeskFlags, authoringWorkspace, $rootScope) => {
        expect(superdeskFlags.flags.authoring).toBeFalsy();

        authoringWorkspace.edit(item);
        $rootScope.$apply();

        expect(authoringWorkspace.item).toBe(lockedItem);
        expect(authoringWorkspace.action).toBe('edit');
        expect(authoringWorkspace.getItem()).toBe(lockedItem);
        expect(authoringWorkspace.getAction()).toBe('edit');
        expect(superdeskFlags.flags.authoring).toBeTruthy();

        authoringWorkspace.close(true);
        expect(authoringWorkspace.item).toBe(null);
        expect(authoringWorkspace.getItem()).toBe(null);
        expect(superdeskFlags.flags.authoring).toBeFalsy();
    }));

    it('can open item in readonly mode', inject((superdeskFlags, authoringWorkspace, $rootScope,
                                                         authoring, $q) => {
        lockedItem._editable = false;
        authoringWorkspace.view(item);
        $rootScope.$apply();
        expect(authoringWorkspace.item).toBe(lockedItem);
        expect(authoringWorkspace.action).toBe('view');
        expect(superdeskFlags.flags.authoring).toBe(true);
        lockedItem._editable = true;
    }));

    it('can kill an item', inject((authoringWorkspace, $rootScope) => {
        authoringWorkspace.kill(item);
        $rootScope.$apply();
        expect(authoringWorkspace.item).toBe(lockedItem);
        expect(authoringWorkspace.action).toBe('kill');
    }));

    it('can handle edit.item activity', inject((superdesk, authoringWorkspace, $rootScope) => {
        superdesk.intent('edit', 'item', item);
        $rootScope.$digest();
        expect(authoringWorkspace.item).toBe(lockedItem);
        expect(authoringWorkspace.action).toBe('edit');
    }));

    it('can open an item for edit or readonly', inject((authoringWorkspace, authoring, send, $q, $rootScope) => {
        item.state = 'draft';
        authoringWorkspace.open(item);
        expect(authoring.open).toHaveBeenCalledWith(item._id, false, null);

        item.state = 'published';
        authoringWorkspace.open(item);
        expect(authoring.open).toHaveBeenCalledWith(item._id, true, null);

        var archived = {_id: 'bar'};

        spyOn(send, 'one').and.returnValue($q.when(archived));
        item._type = 'ingest';
        authoringWorkspace.open(item);
        expect(send.one).toHaveBeenCalledWith(item);
        $rootScope.$digest();
        expect(authoring.open).toHaveBeenCalledWith(archived._id, false, null);
    }));

    describe('init', () => {
        it('can open item from $location for editing', inject((api, $location, $rootScope, $injector) => {
            $location.search('item', item._id);
            $location.search('action', 'edit');
            $rootScope.$digest();

            var authoringWorkspace = $injector.get('authoringWorkspace');

            $rootScope.$digest();

            expect(authoringWorkspace.item).toBe(lockedItem);
            expect(authoringWorkspace.action).toBe('edit');
        }));

        it('can open item from $location for viewing', inject(($location, $rootScope, $injector) => {
            $location.search('item', 'bar');
            $location.search('action', 'view');
            $rootScope.$digest();
            var authoringWorkspace = $injector.get('authoringWorkspace');

            $rootScope.$digest();
            expect(authoringWorkspace.item).toBe(lockedItem);
            expect(authoringWorkspace.action).toBe('view');
        }));
    });
});

describe('authoring container directive', () => {
    beforeEach(window.module('superdesk.apps.authoring'));
    beforeEach(window.module('superdesk.templates-cache'));
    beforeEach(window.module('superdesk.apps.searchProviders'));

    beforeEach(inject(($templateCache) => {
        // avoid loading of authoring
        $templateCache.put('scripts/apps/authoring/views/authoring-container.html', '<div></div>');
    }));

    var item, lockedItem, scope, elem, iscope;

    beforeEach(inject(($compile, $rootScope, $q, authoring) => {
        item = {_id: 'foo'};
        lockedItem = {_id: item._id, _editable: true};
        spyOn(authoring, 'open').and.returnValue($q.when(lockedItem));

        scope = $rootScope.$new();
        elem = $compile('<div sd-authoring-container></div>')(scope);
        scope.$digest();
        iscope = elem.isolateScope();
    }));

    it('handles edit', inject((authoringWorkspace, $rootScope) => {
        authoringWorkspace.edit(item);
        $rootScope.$digest();

        // testing reset in first cycle between
        expect(iscope.authoring.item).toBe(null);

        $rootScope.$digest();

        expect(iscope.authoring.item).toBe(lockedItem);
        expect(iscope.authoring.action).toBe('edit');
        expect(iscope.authoring.state.opened).toBe(true);

        authoringWorkspace.close(true);
        $rootScope.$digest();
        expect(iscope.authoring.item).toBe(null);
        expect(iscope.authoring.state.opened).toBe(false);
    }));

    it('handles view', inject((authoringWorkspace, $rootScope) => {
        lockedItem._editable = false;
        authoringWorkspace.view(item);
        $rootScope.$digest();
        $rootScope.$digest();
        expect(iscope.authoring.item).toBe(lockedItem);
        expect(iscope.authoring.action).toBe('view');
        expect(iscope.authoring.state.opened).toBe(true);
        lockedItem._editable = true;
    }));

    it('handles kill', inject((authoringWorkspace, $rootScope) => {
        authoringWorkspace.kill(item);
        $rootScope.$digest();
        $rootScope.$digest();
        expect(iscope.authoring.item).toBe(lockedItem);
        expect(iscope.authoring.action).toBe('kill');
    }));

    it('handles correct', inject((authoringWorkspace, $rootScope) => {
        authoringWorkspace.correct(item);
        $rootScope.$digest();
        $rootScope.$digest();
        expect(iscope.authoring.item).toBe(lockedItem);
        expect(iscope.authoring.action).toBe('correct');
    }));

    describe('authoring embed directive', () => {
        beforeEach(inject(($templateCache) => {
            $templateCache.put('scripts/apps/authoring/views/authoring.html', '<div></div>');
        }));

        it('applies kill template',
                inject((authoringWorkspace, $rootScope, api, $compile, $q) => {
                    authoringWorkspace.kill(item);
                    $rootScope.$digest();
                    $rootScope.$digest();
                    expect(iscope.authoring.item).toBe(lockedItem);
                    expect(iscope.authoring.action).toBe('kill');

                    spyOn(api, 'save').and.returnValue($q.when({}));

                    var elemEmbed = $compile('<div sd-authoring-embedded data-item="authoring.item"' +
                ' data-action="authoring.action"></div>')(iscope);

                    iscope.$digest();
                    var iscopeEmbed = elemEmbed.isolateScope();

                    expect(iscopeEmbed.action).toBe('kill');
                    expect(api.save)
                        .toHaveBeenCalledWith('content_templates_apply', {}, {
                            template_name: 'kill',
                            item: {_id: 'foo'}
                        }, {});
                }));
    });
});

describe('authoring themes', () => {
    beforeEach(window.module('superdesk.core.preferences'));
    beforeEach(window.module('superdesk.apps.authoring'));
    beforeEach(window.module('superdesk.apps.searchProviders'));

    beforeEach(inject(($q, preferencesService) => {
        spyOn(preferencesService, 'get').and.returnValue($q.when({'editor:theme': ['theme:proofreadTheme']}));
    }));

    var normalTheme = {
            cssClass: '',
            label: 'Default',
            key: 'default'
        },
        darkTheme = {
            cssClass: 'dark-theme-mono',
            label: 'Dark monospace',
            key: 'dark-mono'
        };

    it('can define normal theme', inject((authThemes) => {
        spyOn(authThemes, 'save');
        authThemes.save('theme', normalTheme);
        expect(authThemes.save).toHaveBeenCalledWith('theme', normalTheme);
    }));

    it('can define proofread theme', inject((authThemes) => {
        spyOn(authThemes, 'save');
        authThemes.save('proofreadTheme', darkTheme);
        expect(authThemes.save).toHaveBeenCalledWith('proofreadTheme', darkTheme);
    }));

    it('can get normal theme', inject((authThemes, $rootScope) => {
        var theme = null;

        authThemes.get('theme').then((_theme) => {
            theme = _theme;
        });
        $rootScope.$digest();
        expect(theme).not.toBe(null);
    }));

    it('can get proofread theme', inject((authThemes, $rootScope) => {
        var proofreadTheme = null;

        authThemes.get('proofreadTheme').then((_theme) => {
            proofreadTheme = _theme;
        });
        $rootScope.$digest();
        expect(proofreadTheme).not.toBe(null);
    }));
});

describe('send item directive', () => {
    beforeEach(window.module(($provide) => {
        $provide.constant('config', {server: {url: undefined}, iframely: {key: '123'}, editor: {}});
    }));

    beforeEach(window.module('superdesk.apps.editor2'));
    beforeEach(window.module('superdesk.core.preferences'));
    beforeEach(window.module('superdesk.apps.authoring'));
    beforeEach(window.module('superdesk.templates-cache'));
    beforeEach(window.module('superdesk.core.api'));
    beforeEach(window.module('superdesk.apps.vocabularies'));
    beforeEach(window.module('superdesk.apps.searchProviders'));

    beforeEach(inject(($templateCache) => {
        $templateCache.put('scripts/apps/authoring/views/send-item.html', '');
    }));

    it('can hide embargo and publish schedule if take items more than one',
        inject(($compile, $rootScope, privileges) => {
            var scope, elem, iscope;

            scope = $rootScope.$new();
            scope.item = {
                _id: 'foo',
                type: 'text',
                state: 'in-progress',
                takes: {
                    sequence: 2
                }
            };
            var userPrivileges = {
                embargo: true
            };

            privileges.setUserPrivileges(userPrivileges);
            $rootScope.$digest();
            scope.action = 'edit';
            elem = $compile('<div sd-send-item data-item="item" data-mode="authoring" ' +
                'data-action="action"></div>')(scope);
            scope.$digest();
            iscope = elem.isolateScope();
            expect(iscope.showPublishSchedule()).toBe(false);
            expect(iscope.showEmbargo()).toBe(false);
        }));

    it('can show embargo and publish schedule if only one take item',
        inject(($compile, $rootScope, privileges) => {
            var scope, elem, iscope;

            scope = $rootScope.$new();
            scope.item = {
                _id: 'foo',
                type: 'text',
                state: 'in-progress',
                takes: {
                    sequence: 1
                }
            };
            var userPrivileges = {
                embargo: true
            };

            privileges.setUserPrivileges(userPrivileges);
            $rootScope.$digest();
            scope.action = 'edit';
            elem = $compile('<div sd-send-item data-item="item" data-mode="authoring" ' +
                'data-action="action"></div>')(scope);
            scope.$digest();
            iscope = elem.isolateScope();
            expect(iscope.showPublishSchedule()).toBe(true);
            expect(iscope.showEmbargo()).toBe(true);
        }));

    it('can hide embargo if user does not have the privilege',
        inject(($compile, $rootScope, privileges) => {
            var scope, elem, iscope;

            scope = $rootScope.$new();
            scope.item = {
                _id: 'foo',
                type: 'text',
                state: 'in-progress',
                takes: {
                    sequence: 1
                }
            };
            var userPrivileges = {
                embargo: false
            };

            privileges.setUserPrivileges(userPrivileges);
            $rootScope.$digest();
            scope.action = 'edit';
            elem = $compile('<div sd-send-item data-item="item" data-mode="authoring" ' +
                'data-action="action"></div>')(scope);
            scope.$digest();
            iscope = elem.isolateScope();
            expect(iscope.showPublishSchedule()).toBe(true);
            expect(iscope.showEmbargo()).toBe(false);
        }));

    it('can show embargo and publish schedule if not a take item',
        inject(($compile, $rootScope, privileges) => {
            var scope, elem, iscope;

            scope = $rootScope.$new();
            scope.item = {
                _id: 'foo',
                type: 'text',
                state: 'in-progress'
            };
            var userPrivileges = {
                embargo: true
            };

            privileges.setUserPrivileges(userPrivileges);
            $rootScope.$digest();
            scope.action = 'edit';
            elem = $compile('<div sd-send-item data-item="item" data-mode="authoring" ' +
                'data-action="action"></div>')(scope);
            scope.$digest();
            iscope = elem.isolateScope();
            expect(iscope.showPublishSchedule()).toBe(true);
            expect(iscope.showEmbargo()).toBe(true);
        }));

    it('can show embargo date',
        inject(($compile, $rootScope, privileges) => {
            var scope, elem, iscope;

            scope = $rootScope.$new();
            scope.item = {
                _id: 'foo',
                type: 'text',
                state: 'in-progress',
                embargo_date: Date()
            };
            var userPrivileges = {
                embargo: true
            };

            privileges.setUserPrivileges(userPrivileges);
            $rootScope.$digest();
            scope.action = 'edit';
            elem = $compile('<div sd-send-item data-item="item" data-mode="authoring" ' +
                'data-action="action"></div>')(scope);
            scope.$digest();
            iscope = elem.isolateScope();
            expect(iscope.showPublishSchedule()).toBe(false);
            expect(iscope.showEmbargo()).toBe(true);
        }));

    it('can show published schedule date',
        inject(($compile, $rootScope) => {
            var scope, elem, iscope;

            scope = $rootScope.$new();
            scope.item = {
                _id: 'foo',
                type: 'text',
                state: 'in-progress',
                publish_schedule_date: Date()
            };
            scope.action = 'edit';
            elem = $compile('<div sd-send-item data-item="item" data-mode="authoring" ' +
                'data-action="action"></div>')(scope);
            scope.$digest();
            iscope = elem.isolateScope();
            expect(iscope.showPublishSchedule()).toBe(true);
            expect(iscope.showEmbargo()).toBe(false);
        }));

    it('can get last destination desk and stage',
        inject(($compile, $rootScope, preferencesService, $q) => {
            var scope, elem, iscope;

            scope = $rootScope.$new();
            scope.item = {
                _id: '123456',
                type: 'text'
            };

            var destination = {desk: '123', stage: '456'};

            spyOn(preferencesService, 'get').and.returnValue($q.when(destination));

            scope.action = 'edit';
            elem = $compile('<div sd-send-item data-item="item" data-mode="authoring" ' +
                'data-action="action"></div>')(scope);

            scope.$digest();

            iscope = elem.isolateScope();
            iscope.destination_last = null;

            preferencesService.get().then((prefs) => {
                iscope.destination_last = {
                    desk: prefs.desk,
                    stage: prefs.stage
                };
            });

            iscope.$digest();

            expect(iscope.destination_last.desk).toEqual('123');
            expect(iscope.destination_last.stage).toEqual('456');
        }));

    it('can show send and publish button',
        inject(($compile, $rootScope, config) => {
            var scope, elem, iscope;

            scope = $rootScope.$new();
            scope.item = {
                _id: 'foo',
                type: 'text',
                state: 'in-progress',
                task: {
                    desk: '123',
                    stage: '456'
                },
                _current_version: 1
            };
            scope.action = 'edit';
            elem = $compile('<div sd-send-item data-item="item" data-orig="item" data-mode="authoring" ' +
                'data-action="action"></div>')(scope);
            scope.$digest();
            iscope = elem.isolateScope();
            expect(iscope.canSendAndPublish()).toBeFalsy();
            config.ui = {sendAndPublish: 1};
            expect(iscope.canSendAndPublish()).toBeFalsy();
            iscope.selectedDesk = {_id: '123'};
            iscope.selectedStage = {_id: '456'};
            expect(iscope.canSendAndPublish()).toBeFalsy();
            iscope.selectedDesk = {_id: '123'};
            iscope.selectedStage = {_id: '4566'};
            iscope.itemActions = {publish: 1};
            expect(iscope.canSendAndPublish()).toBeFalsy();
            iscope.selectedDesk = {_id: '1234'};
            iscope.selectedStage = {_id: '456'};
            expect(iscope.canSendAndPublish()).toBeTruthy();
        }));

    describe('Send And Publish', () => {
        var scope, iScope, elem, publish;
        var movedItem = {
            _id: 'foo',
            type: 'text',
            state: 'in-progress',
            task: {
                desk: 'New Desk',
                stage: 'New Stage'
            },
            _current_version: 2,
            _etag: '1111',
            _locked: true
        };

        var selectedDesk = {
            _id: 'New Desk', name: 'new desk'
        };

        var selectedStage = {
            _id: 'New Stage', name: 'new stage'
        };

        beforeEach(inject(($q, $compile, $rootScope, api, editor) => {
            spyOn(editor, 'countErrors').and.returnValue($q.when(0));
            spyOn(api, 'find').and.returnValue($q.when({}));
            spyOn(api, 'save').and.returnValue($q.when({task: {desk: 'new', stage: 'new'}}));

            scope = $rootScope.$new();
            scope.item = {
                _id: 'foo',
                type: 'text',
                state: 'in-progress',
                task: {
                    desk: '123',
                    stage: '456'
                },
                _current_version: 1,
                _etag: '123'
            };
            scope.action = 'edit';
            scope.publish = function() {
                return publish;
            };
            elem = $compile('<div sd-send-item data-item="item" data-orig="item" data-mode="authoring" ' +
                'data-action="action" data-publish="publish()"></div>')(scope);
            scope.$digest();
            iScope = elem.isolateScope();
        }));

        it('can send and publish item to different desk', inject((authoring, $q, authoringWorkspace) => {
            publish = true; // publish succeeds
            iScope.selectedDesk = selectedDesk;
            iScope.selectedStage = selectedStage;
            spyOn(authoring, 'open').and.returnValue($q.when(movedItem));
            spyOn(authoringWorkspace, 'close').and.returnValue($q.when(true));
            expect(iScope.orig.task.desk).toBe('123');
            expect(iScope.orig.task.stage).toBe('456');
            expect(iScope.orig._etag).toBe('123');
            iScope.sendAndPublish();
            iScope.$digest();
            expect(authoring.open).toHaveBeenCalledWith('foo', false);
            expect(authoringWorkspace.close).toHaveBeenCalledWith(false);
            expect(iScope.orig.task.desk).toBe(selectedDesk._id);
            expect(iScope.orig.task.stage).toBe(selectedStage._id);
            expect(iScope.orig._locked).toBe(true);
            expect(iScope.orig._etag).toBe('1111');
        }));

        it('can send and publish item to different desk publish fails',
            inject((authoring, $q, authoringWorkspace, notify) => {
                publish = false; // publish succeeds
                iScope.selectedDesk = selectedDesk;
                iScope.selectedStage = selectedStage;
                spyOn(authoring, 'open').and.returnValue($q.when(movedItem));
                spyOn(authoringWorkspace, 'close').and.returnValue($q.when(true));
                expect(iScope.orig.task.desk).toBe('123');
                expect(iScope.orig.task.stage).toBe('456');
                expect(iScope.orig._etag).toBe('123');
                iScope.sendAndPublish();
                iScope.$digest();
                expect(authoring.open).toHaveBeenCalledWith('foo', false);
                expect(authoringWorkspace.close).not.toHaveBeenCalledWith(false);
                expect(iScope.orig.task.desk).toBe(selectedDesk._id);
                expect(iScope.orig.task.stage).toBe(selectedStage._id);
                expect(iScope.orig._locked).toBe(true);
                expect(iScope.orig._etag).toBe('1111');
            }));

        it('can send and publish item to different desk but locking failed',
            inject((authoring, $q, authoringWorkspace, notify) => {
                publish = true; // publish succeeds
                movedItem._locked = false; // locked failed.
                iScope.selectedDesk = selectedDesk;
                iScope.selectedStage = selectedStage;
                spyOn(authoring, 'open').and.returnValue($q.when(movedItem));
                spyOn(authoringWorkspace, 'close').and.returnValue($q.when(true));
                spyOn(notify, 'error');
                expect(iScope.orig.task.desk).toBe('123');
                expect(iScope.orig.task.stage).toBe('456');
                expect(iScope.orig._etag).toBe('123');
                iScope.sendAndPublish();
                iScope.$digest();
                expect(authoring.open).toHaveBeenCalledWith('foo', false);
                expect(authoringWorkspace.close).not.toHaveBeenCalledWith(false);
                expect(iScope.orig.task.desk).toBe(selectedDesk._id);
                expect(iScope.orig.task.stage).toBe(selectedStage._id);
                expect(iScope.orig._locked).toBe(false);
                expect(iScope.orig._etag).toBe('1111');
                expect(notify.error).toHaveBeenCalledWith('Failed to send and publish.');
            }));
    });
});
