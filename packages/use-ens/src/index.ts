import { useEffect, useState } from 'react'
import { getENS, ResolvedENS } from 'get-ens'
import type { BaseProvider as Provider } from '@ethersproject/providers'

/**
 * A React hook to fetch ENS records from a domain.
 * @param provider Ethers.js provider
 * @param domain ENS domain to fetch data from
 * @returns
 */
export const useENS = ({
  provider,
  domain,
  fetchOptions,
  contractAddress
}: {
  provider: Provider
  domain: string
  fetchOptions?: RequestInit
  contractAddress?: string
}): ResolvedENS => {
  const [data, set] = useState<ResolvedENS>({ address: null, owner: null, records: { web: {} } })

  useEffect(() => {
    if (provider && domain) {
      provider.getNetwork().then(({ chainId }) => {
        if (contractAddress || chainId === 1) {
          getENS(provider, contractAddress)(domain, fetchOptions).then(set)
        }
      })
    }
  }, [domain, provider])

  return data
}