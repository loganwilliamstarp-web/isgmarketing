# Run a SQL query against the linked Supabase project via the management API,
# using the Supabase CLI token stored in Windows Credential Manager.
# Usage: .\scripts\db-query.ps1 -Query "SELECT 1"
param(
  [Parameter(Mandatory=$true)][string]$Query,
  [string]$ProjectRef = "wpgncfbjghmyvrpadeuw"
)

$sig = @'
using System;
using System.Runtime.InteropServices;
public class CredManQ {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public struct CREDENTIAL {
    public int Flags; public int Type; public string TargetName; public string Comment;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
    public int CredentialBlobSize; public IntPtr CredentialBlob; public int Persist;
    public int AttributeCount; public IntPtr Attributes; public string TargetAlias; public string UserName;
  }
  [DllImport("Advapi32.dll", EntryPoint="CredReadW", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern bool CredRead(string target, int type, int flags, out IntPtr credentialPtr);
  [DllImport("Advapi32.dll")]
  public static extern void CredFree(IntPtr cred);
  public static byte[] GetSecretBytes(string target) {
    IntPtr ptr;
    if (!CredRead(target, 1, 0, out ptr)) return null;
    var cred = (CREDENTIAL)Marshal.PtrToStructure(ptr, typeof(CREDENTIAL));
    byte[] bytes = new byte[cred.CredentialBlobSize];
    if (cred.CredentialBlobSize > 0) Marshal.Copy(cred.CredentialBlob, bytes, 0, cred.CredentialBlobSize);
    CredFree(ptr);
    return bytes;
  }
}
'@
if (-not ([System.Management.Automation.PSTypeName]'CredManQ').Type) { Add-Type -TypeDefinition $sig }
$bytes = [CredManQ]::GetSecretBytes("Supabase CLI:supabase")
$token = [System.Text.Encoding]::UTF8.GetString($bytes).Trim()
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$body = @{ query = $Query } | ConvertTo-Json
$r = Invoke-RestMethod -Method Post -Uri "https://api.supabase.com/v1/projects/$ProjectRef/database/query" -Headers @{ Authorization = "Bearer $token" } -ContentType "application/json" -Body $body
$r | ConvertTo-Json -Depth 8
