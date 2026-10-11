import { setDefaultResultOrder } from 'dns';
import { setDefaultAutoSelectFamilyAttemptTimeout } from 'net';

/**
 * Salida a internet estable cuando el equipo del panel está en una VPN.
 *
 * Las VPN (WireGuard, OpenVPN, Tailscale con nodo de salida…) suelen dejar
 * IPv6 sin ruta y añadir latencia. Node prueba cada dirección del proveedor
 * solo 250 ms antes de pasar a la siguiente: por la VPN el apretón de manos
 * tarda más y todas fallan (ETIMEDOUT), aunque `curl` sí conecte. Se resuelve
 * primero IPv4 y cada intento tiene margen.
 *
 * Para salir por un proxy HTTP(S): HTTPS_PROXY/NO_PROXY con NODE_USE_ENV_PROXY=1.
 */
const ATTEMPT_TIMEOUT_MS = Number(process.env.NET_ATTEMPT_TIMEOUT_MS) || 2_500;

setDefaultResultOrder(process.env.NET_IP_ORDER === 'verbatim' ? 'verbatim' : 'ipv4first');
setDefaultAutoSelectFamilyAttemptTimeout(ATTEMPT_TIMEOUT_MS);
