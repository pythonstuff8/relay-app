import { useEffect } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors } from '../constants/theme';
import { useBridge } from '../context/BridgeContext';
import { parsePairingUrl } from '../utils/pairing';

// Handles relay://pair?host=..&port=..&token=..&name=..&v=1, so scanning the desktop
// QR code with the system Camera app opens Relay and pairs in one step.
export default function PairLink() {
  const params = useLocalSearchParams<{ host?: string; port?: string; token?: string; name?: string }>();
  const router = useRouter();
  const { pair } = useBridge();

  useEffect(() => {
    const query = Object.entries(params)
      .filter(([, value]) => typeof value === 'string')
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
      .join('&');
    const pairing = parsePairingUrl(`relay://pair?${query}`);
    if (pairing) pair(pairing);
    router.replace(pairing ? '/middleware' : '/middleware/pair');
  }, [params, pair, router]);

  return <View style={{ flex: 1, backgroundColor: Colors.background }} />;
}
