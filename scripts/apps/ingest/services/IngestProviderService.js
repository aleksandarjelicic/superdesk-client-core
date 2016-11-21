import {PROVIDER_DASHBOARD_DEFAULTS} from 'apps/ingest/constants';

IngestProviderService.$inject = ['api', '$q', 'preferencesService', '$filter', 'searchProviderService'];
export function IngestProviderService(api, $q, preferencesService, $filter, searchProviderService) {
    var _getAllIngestProviders = function(criteria, page, providers) {
        page = page || 1;
        providers = providers || [];
        criteria = criteria || {};

        return api.query('ingest_providers', _.extend({max_results: 200, page: page}, criteria))
        .then(function(result) {
            providers = providers.concat(result._items);
            if (result._links.next) {
                page++;
                return _getAllIngestProviders(criteria, page, providers);
            }
            return $filter('sortByName')(providers);
        });
    };

    var service = {
        providers: null,
        providersLookup: {},
        fetched: null,
        fetchProviders: function() {
            var self = this;
            var providersPromise = $q.all([_getAllIngestProviders(), searchProviderService.getSearchProviders()]);

            return providersPromise.then(function(results) {
                self.providers = [];

                results.forEach(function(result) {
                    self.providers = self.providers.concat(result);
                });
            });
        },
        generateLookup: function() {
            var self = this;

            this.providersLookup = _.keyBy(self.providers, '_id');

            return $q.when();
        },
        initialize: function() {
            if (!this.fetched) {

                this.fetched = this.fetchProviders()
                    .then(angular.bind(this, this.generateLookup));
            }

            return this.fetched;
        },
        fetchAllIngestProviders: function(criteria) {
            return _getAllIngestProviders(criteria);
        },
        fetchDashboardProviders: function() {
            var deferred = $q.defer();
            _getAllIngestProviders().then(function (result) {
                var ingestProviders = result;
                preferencesService.get('dashboard:ingest').then(function(userIngestProviders) {
                    if (!_.isArray(userIngestProviders)) {
                        userIngestProviders = [];
                    }

                    _.forEach(ingestProviders, function(provider) {
                        var userProvider = _.find(userIngestProviders, function(item) {
                            return item._id === provider._id;
                        });

                        provider.dashboard_enabled = !!userProvider;
                        forcedExtend(provider, userProvider ? userProvider : PROVIDER_DASHBOARD_DEFAULTS);
                    });

                    deferred.resolve(ingestProviders);
                }, function (error) {
                    deferred.reject(error);
                });
            }, function (error) {
                deferred.reject(error);
            });

            return deferred.promise;
        }
    };
    return service;
}

function forcedExtend(dest, src) {
    _.each(PROVIDER_DASHBOARD_DEFAULTS, function(value, key) {
        if (_.has(src, key)) {
            dest[key] = src[key];
        } else {
            dest[key] = PROVIDER_DASHBOARD_DEFAULTS[key];
        }
    });
}
