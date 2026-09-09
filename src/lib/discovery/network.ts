import { networkInterfaces } from "os";

export function getActiveLocalIP(): { ip: string; interfaceName: string } {
  const nets = networkInterfaces();
  const virtualPatterns = /virtual|vbox|veth|wsl|docker|hyper-v|vmware|bluetooth|loopback|pseudo/i;
  const preferredPatterns = /wi-fi|wireless|wlan|ethernet|eth|en/i;

  let candidateIP = "127.0.0.1";
  let candidateInterface = "loopback";
  let hasCandidate = false;

  for (const name of Object.keys(nets)) {
    if (virtualPatterns.test(name)) continue;

    for (const net of nets[name] || []) {
      if (net.family === "IPv4" && !net.internal && !net.address.startsWith("169.254.")) {
        if (preferredPatterns.test(name)) {
          console.log(`[Discovery] Selected active Wi-Fi/Ethernet interface '${name}' -> ${net.address}`);
          return { ip: net.address, interfaceName: name };
        }
        if (!hasCandidate) {
          candidateIP = net.address;
          candidateInterface = name;
          hasCandidate = true;
        }
      }
    }
  }

  if (hasCandidate) {
    console.log(`[Discovery] Selected fallback interface '${candidateInterface}' -> ${candidateIP}`);
    return { ip: candidateIP, interfaceName: candidateInterface };
  }

  // Emergency fallback
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === "IPv4" && !net.internal && !net.address.startsWith("169.254.")) {
        console.log(`[Discovery] Selected emergency interface '${name}' -> ${net.address}`);
        return { ip: net.address, interfaceName: name };
      }
    }
  }

  console.warn(`[Discovery] No valid IPv4 found, falling back to 127.0.0.1`);
  return { ip: "127.0.0.1", interfaceName: "loopback" };
}
