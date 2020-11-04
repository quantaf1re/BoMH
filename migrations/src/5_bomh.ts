export default async (
    { artifacts }: { artifacts: Truffle.Artifacts },
    deployer,
    network,
    accounts,
): Promise<void> => {
    if (deployer.network === "fork") {
        // Don't bother running these migrations -- speed up the testing
        return;
    }

    const [default_] = accounts;
    console.log('derp');
    console.log(default_);

    const c_Auction = artifacts.require("Auction");
    const c_Masset = artifacts.require("Masset");

    const d_mUSD = await c_Masset.deployed();


    await deployer.deploy(
        c_Auction,
        86400,
        default_,
        d_mUSD.address,
        d_mUSD.address,
        // {
        //     from: default_,
        // },
    );

    // const d_Auction = await c_Auction.deployed();







}
