using System.Security.Cryptography;
using System.Text;
using BarberFlow.Api.Domain.Entities;

namespace BarberFlow.Api.Services;

// A keyed fingerprint revokes all issued sessions when credentials change,
// without exposing the stored password hash in readable JWT claims.
public static class SessionStamp
{
    public const string Claim = "session_stamp";
    public static string Create(SalonUser user, string key) =>
        Convert.ToHexString(HMACSHA256.HashData(Encoding.UTF8.GetBytes(key),
            Encoding.UTF8.GetBytes($"{user.Id}:{user.SalonId}:{user.PasswordHash}:{user.Role}")));
}
