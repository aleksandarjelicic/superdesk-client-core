/* eslint-disable newline-per-chained-call */


var openUrl = require('./helpers/utils').open,
    analytics = require('./helpers/analytics');

describe('analytics', () => {
    beforeEach(() => {
        openUrl('/#/analytics');
    });

    it('manage activity reports', () => {
        analytics.setOperation('Publish');
        analytics.setDesk('Sports');
        analytics.setOperationDate('13/12/2016');
        analytics.setSubject(['education', 'university']);
        analytics.setReportName('report1');
        analytics.setReportDescription('report1 description');
        analytics.saveReport();
        browser.sleep(100);
        expect(analytics.userReports.count()).toEqual(1);
        expect(analytics.globalReports.count()).toEqual(0);
        expect(analytics.getUserReportName(0).getText()).toEqual('report1');

        analytics.openActivityReportForm();
        analytics.setOperation('Correct');
        analytics.setOperationDate('13/12/2016');
        analytics.setSubject(['education', 'university']);
        analytics.setReportName('report2');
        analytics.setReportDescription('report2 description');
        analytics.toggleGlobal();
        analytics.switchToGrouping();
        analytics.toggleGroupByDesk();
        analytics.saveReport();
        browser.sleep(100);
        expect(analytics.userReports.count()).toEqual(2);
        expect(analytics.globalReports.count()).toEqual(1);
        expect(analytics.getUserReportName(0).getText()).toEqual('report1');
        expect(analytics.getUserReportName(1).getText()).toContain('report2');
        expect(analytics.getGlobalReportName(0).getText()).toContain('report2');

        analytics.editUserReport(0);
        browser.sleep(100);
        analytics.switchToParameters();
        expect(analytics.getReportName().getAttribute('value')).toEqual('report1');
        expect(analytics.getReportDescription().getAttribute('value')).toEqual('report1 description');
        expect(analytics.getReportOperation().getAttribute('value')).toEqual('publish');
        expect(analytics.getReportDesk().getText()).toContain('Sports');
        expect(analytics.getOperationDate().getAttribute('value')).toEqual('13/12/2016');
        expect(analytics.getReportGlobal().getAttribute('checked')).toBeFalsy();
        analytics.switchToGrouping();
        expect(analytics.getReportGroupByDesk().getAttribute('checked')).toBeFalsy();

        analytics.openSavedActivityReports();
        analytics.removeUserReport(0);
        expect(analytics.userReports.count()).toEqual(1);

        analytics.editUserReport(0);
        browser.sleep(100);
        analytics.switchToParameters();
        expect(analytics.getReportName().getAttribute('value')).toEqual('report2');
        expect(analytics.getReportDescription().getAttribute('value')).toEqual('report2 description');
        expect(analytics.getReportOperation().getAttribute('value')).toEqual('correct');
        expect(analytics.getOperationDate().getAttribute('value')).toEqual('13/12/2016');
        expect(analytics.getReportGlobal().getAttribute('checked')).toBeTruthy();
        analytics.switchToGrouping();
        expect(analytics.getReportGroupByDesk().getAttribute('checked')).toBeTruthy();
    });
});
