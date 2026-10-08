-- Read-only TT-11 audit. Run against the intended test/staging database first.
-- No booking, payment, customer or service data is modified.
DECLARE @SalonSlug nvarchar(120) = N'royal-barbers';

SELECT b.PublicId AS BookingId,
       b.BookingCode,
       b.AppointmentDate,
       b.Status,
       b.ServiceLocation,
       b.TotalAmount AS BookingTotal,
       COALESCE(lines.LineTotal, 0) AS ServiceLineTotal,
       b.TotalAmount - COALESCE(lines.LineTotal, 0) AS UnallocatedAmount,
       COALESCE(b.SpecialServiceAmount, 0) AS CustomAmount,
       COALESCE(lines.CustomLineAmount, 0) AS CustomLineAmount,
       CASE WHEN COALESCE(lines.LineCount, 0) = 0 THEN N'No service snapshots'
            WHEN COALESCE(b.SpecialServiceAmount, 0) <> COALESCE(lines.CustomLineAmount, 0)
              THEN N'Custom line missing or out of date'
            ELSE N'Snapshot total differs; inspect original booking records'
       END AS Finding
FROM Bookings AS b
JOIN Salons AS salon ON salon.Id = b.SalonId
OUTER APPLY (
    SELECT COUNT_BIG(*) AS LineCount,
           SUM(bs.Amount) AS LineTotal,
           SUM(CASE WHEN bs.ServiceId IS NULL AND bs.ServiceName = N'Custom Home Service'
                    THEN bs.Amount ELSE 0 END) AS CustomLineAmount
    FROM BookingServices AS bs
    WHERE bs.BookingId = b.Id
) AS lines
WHERE salon.Slug = @SalonSlug
  AND (b.TotalAmount <> COALESCE(lines.LineTotal, 0)
       OR COALESCE(b.SpecialServiceAmount, 0) <> COALESCE(lines.CustomLineAmount, 0))
ORDER BY b.AppointmentDate, b.PublicId;

-- A zero-row result only establishes internal reconciliation. It cannot prove that
-- an old home-service price was correct: current catalogue prices are not evidence
-- of the catalogue price in force when a historical booking was created.
