import logd from 'logd';
import superagent from 'superagent';
import uuid from 'uuid';
import os from 'os';
import v8 from 'v8';
import machineId from 'ee-machine-id';



const log = logd.module('rda-service-registry-client');




/**
 * client interface for the service registry
 */
export default class ServiceRegistryClient {



    /**
     * set up the client
     *
     * @param      {Object}  arg1                options
     * @param      {string}  arg1.identifier     the unique identifier to use when registering as
     *                                           service
     * @param      {string}  arg1.protocol       The protocol to user
     * @param      {string}  arg1.registryHost   The registry host
     * @param      {string}  arg1.serviceName    the service name to use when registering as service
     * @param      {number}  arg1.webserverPort  the port to connect to
     */
    constructor({
        identifier = uuid.v4(),
        protocol = 'http://',
        registryHost,
        serviceName,
        webserverPort,
    }) {
        this.registryHost = registryHost;
        this.identifier = identifier;
        this.serviceName = serviceName;
        this.webserverPort = webserverPort;
        this.protocol = protocol;
        this.machineId = machineId();

        this.baseURL = `${this.registryHost}/rda-service-registry.service-instance`;


        // if set top true we've been de-registered
        this.isDeregistered = false;
    }






    /**
     * call the registry in double the required frequency
     *
     * @return     {Promise}  undefined
     */
    async pollRegistry() {
        await this.wait(this.ttl / 2);

        // don't update after the service was de-registered
        if (this.isDeregistered) return;


        // call the registry and let them know that we're alive
        superagent.patch(`${this.baseURL}/${this.identifier}`)
            .ok(res => res.status === 200)
            .send()
            .catch((err) => {
                log.error(err);
            });


        // run again
        this.pollRegistry();
    }





    /**
     * pause for some milliseconds
     *
     * @param      {number}   msec    number of milliseconds to pause
     * @return     {Promise}  undefined
     */
    wait(msec) {
        return new Promise((resolve) => {
            this.timeout = setTimeout(resolve, msec);
        });
    }




    /**
     * remove service registration
     *
     * @return     {Promise}  undefined
     */
    async deregister() {
        this.isDeregistered = true;
        clearTimeout(this.timeout);
        await superagent.delete(`${this.baseURL}/${this.identifier}`)
            .ok(res => res.status === 200)
            .send();
    }





    /**
     * set the port of the registry server
     *
     * @param      {number}  port    port of the server
     */
    setPort(port) {
        this.webserverPort = port;
    }




    /**
     * register service
     *
     * @return     {Promise}  undefined
     */
    async register() {
        if (this.isDeregistered) {
            throw new Error('Cannot register service, it was de-registered and cannot be registered anymore!');
        } else if (!this.webserverPort) {
            throw new Error('Cannot register service, the web server port (webserverPort) was not passed to the constructor!');
        }

        // get network interfaces, use the first ipv4
        // and the first ipv6 interfaces that are not
        // private or internal
        const addresses = this.getPublicNetworkInterfaces();

        // report the available heap size to the registry, it is used
        // to distribute the load on compute clients
        const stats = v8.getHeapStatistics();


        const response = await superagent.post(this.baseURL)
            .ok(res => res.status === 201)
            .send({
                identifier: this.identifier,
                serviceType: this.serviceName,
                availableMemory: stats.total_available_size,
                machineId: this.machineId,
                ipv4address: addresses.ipv4 ? `${this.protocol}${addresses.ipv4}:${this.webserverPort}` : null,
                ipv6address: addresses.ipv6 ? `${this.protocol}${addresses.ipv6}:${this.webserverPort}` : null,
            });


        // the registry tells us how often we need to
        // update our records (convert from sec to msec)
        this.ttl = response.body.ttl * 1000;


        // start polling the registry, it else will assume
        // that we have died!
        this.pollRegistry();
    }





    /**
     * get the first ipv4 and ipv6 interfaces that are publicly accessible
     *
     * @return     {object}  The public network interfaces.
     */
    getPublicNetworkInterfaces() {
        const interfaces = os.networkInterfaces();
        const interfaceNames = Object.keys(interfaces);
        const result = {};

        for (const interfaceName of interfaceNames) {
            for (const networkInterface of interfaces[interfaceName]) {
                if (!networkInterface.internal) {
                    if (!result[networkInterface.family.toLowerCase()]) {
                        result[networkInterface.family.toLowerCase()] = networkInterface.address;
                    }
                }
            }
        }

        return result;
    }






    /**
     * do a lookup and get the address for a service
     *
     * @param      {string}             serviceName   The service name
     * @param      {Object}             arg2          options
     * @param      {string}             arg2.family   the ip family
     * @param      {(Function|number)}  arg2.timeout  timeout fo the lookup
     * @return     {Promise}            a randomized address for a service
     */
    async resolve(serviceName, {
        family = 'ipv4',
        timeout = 2000,
    } = {}) {
        const response = await superagent.get(this.baseURL)
            .timeout({
                deadline: timeout,
            })
            .ok(res => res.status === 200)
            .query({
                serviceType: serviceName,
            })
            .send();


        const addresses = response.body;

        if (addresses.length) {

            // if multiple addresses are returned, return a random one
            const index = Math.floor(Math.random() * addresses.length);

            if (family === 'ipv4') {
                if (addresses[index].ipv4address) return addresses[index].ipv4address;
                else throw new Error(`Failed to resolve address for service '${serviceName}': the service has no IPv4 address registered!`);
            } else if (family === 'ipv6') {
                if (addresses[index].ipv6address) return addresses[index].ipv6address;
                else throw new Error(`Failed to resolve address for service '${serviceName}': the service has no IPv6 address registered!`);
            }
        } else throw new Error(`Failed to resolve address for service '${serviceName}': service not found!`);
    }
}
