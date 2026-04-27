import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { currentIstTimestamp, endOfMonth, shiftDays, startOfMonth, todayIST } from "@/lib/date-utils";
import { getAdminTeamPeriodReport, type AdminTimeLogReportPeriod } from "@/lib/jira/timelog-admin";

function formatFilenameTimestamp(): string {
  const timestamp = currentIstTimestamp();
  return timestamp
    .replace(/[:]/g, "")
    .replace("T", "-")
    .replace(".000+0530", "-ist");
}

function buildWorksheet(workbook: ExcelJS.Workbook, report: AdminTimeLogReportPeriod) {
  const sheet = workbook.addWorksheet(report.label);
  sheet.columns = [
    { header: "User", key: "user", width: 24 },
    { header: "User Total Hours", key: "userTotalHours", width: 16 },
    { header: "Task Key", key: "taskKey", width: 16 },
    { header: "Task Summary", key: "taskSummary", width: 40 },
    { header: "Project", key: "project", width: 12 },
    { header: "Product / Client", key: "productClient", width: 20 },
    { header: "Task Logged Hours", key: "taskLoggedHours", width: 16 },
    { header: "Last Logged Date", key: "lastLoggedDate", width: 16 },
    { header: "Period From", key: "periodFrom", width: 14 },
    { header: "Period To", key: "periodTo", width: 14 },
  ];

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.alignment = { vertical: "middle" };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFF8FAFC" },
  };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = {
    from: "A1",
    to: "J1",
  };

  for (const user of report.users) {
    if (user.tasks.length === 0) {
      sheet.addRow({
        user: user.displayName,
        userTotalHours: user.totalLoggedHours,
        periodFrom: report.from,
        periodTo: report.to,
      });
      continue;
    }

    for (const task of user.tasks) {
      sheet.addRow({
        user: user.displayName,
        userTotalHours: user.totalLoggedHours,
        taskKey: task.issueKey,
        taskSummary: task.issueSummary,
        project: task.projectKey,
        productClient: task.productClient ?? "Other",
        taskLoggedHours: task.loggedHours,
        lastLoggedDate: task.lastLoggedAt.slice(0, 10),
        periodFrom: report.from,
        periodTo: report.to,
      });
    }
  }

  sheet.getColumn("B").numFmt = "0.00";
  sheet.getColumn("G").numFmt = "0.00";
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const today = todayIST();
  const thisMonthFrom = startOfMonth(today);
  const previousMonthDate = shiftDays(thisMonthFrom, -1);
  const previousMonthFrom = startOfMonth(previousMonthDate);
  const previousMonthTo = endOfMonth(previousMonthDate);
  const nowTimestamp = currentIstTimestamp();

  try {
    const [thisMonth, previousMonth] = await Promise.all([
      getAdminTeamPeriodReport({
        key: "this-month",
        label: "This Month",
        from: thisMonthFrom,
        to: today,
        endTimestamp: nowTimestamp,
      }),
      getAdminTeamPeriodReport({
        key: "previous-month",
        label: "Previous Month",
        from: previousMonthFrom,
        to: previousMonthTo,
      }),
    ]);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Jira Dashboard";
    workbook.created = new Date();
    workbook.modified = new Date();
    workbook.subject = "Team Time Logging Report";
    workbook.title = "Team Time Logging Report";

    buildWorksheet(workbook, thisMonth);
    buildWorksheet(workbook, previousMonth);

    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `team-time-logging-report-${formatFilenameTimestamp()}.xlsx`;

    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
