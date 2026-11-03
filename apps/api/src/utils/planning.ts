export function addBusinessHours(start: Date, hours: number, workdayHours = 8): Date {
  const result = new Date(start);
  let remaining = hours;

  while (remaining > 0) {
    if (isWeekend(result)) {
      moveToNextWorkday(result);
      continue;
    }
    const currentHour = result.getHours();
    if (currentHour < 8) result.setHours(8, 0, 0, 0);
    if (currentHour >= 16) {
      moveToNextWorkday(result);
      continue;
    }
    const availableToday = Math.min(16 - result.getHours(), workdayHours, remaining);
    result.setHours(result.getHours() + availableToday);
    remaining -= availableToday;
  }

  return result;
}

export function recommendedStartForDeadline(deadline: Date, hours: number, bufferDays = 2, workdayHours = 8): Date {
  const workdaysNeeded = Math.ceil(hours / workdayHours) + bufferDays;
  const result = new Date(deadline);
  result.setHours(8, 0, 0, 0);
  let moved = 0;
  while (moved < workdaysNeeded) {
    result.setDate(result.getDate() - 1);
    if (!isWeekend(result)) moved += 1;
  }
  return result;
}

function isWeekend(date: Date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function moveToNextWorkday(date: Date) {
  do {
    date.setDate(date.getDate() + 1);
  } while (isWeekend(date));
  date.setHours(8, 0, 0, 0);
}
