import logd from 'logd';
import HTTP2Client from '@distributed-systems/http2-client';
import uuid from 'uuid';
import os from 'os';
import v8 from 'v8';
import machineId from 'ee-machine-id';
import Delay from '@distributed-systems/delay';



const log = logd.module('rda-service-registry-client');




/**
 * client interface for the service registry
 */
export default class ServiceRegistryClient {



    /**
     * set up the client
     *
     * @param      {string}  registryHost  The registry host
     */
    constructor(registryHost) {
        this.registryHost = registryHost;
        this.machineId = machineId();
        this.baseURL = `${this.registryHost}/rda-service-registry.service-instance`;
        this.httpClient = new HTTP2Client();


        // if set top true we've been de-registered
        this.isDeregistered = false;
    }





    /**
     * shut down the client
     *
     * @return     {Promise}  undefined
     */
    async end() {
        if (this.delay) {
            this.delay.cancel();
        }
    }




    /**
     * call the registry in double the required frequency
     *
     * @return     {Promise}  undefined
     */
    async pollRegistry() {
        this.delay = new Delay();
        await this.delay.wait(this.ttl / 2);


        // don't update after the service was de-registered
        if (this.isDeregistered) return;


        // call the registry and let them know that we're alive
        await this.httpClient.patch(`${this.baseURL}/${this.identifier}`)
            .expect(200)
            .send();


        // run again. important: without the setImmediate call the process may 
        // leak memory
        setImmediate(function t() => {
            this.pollRegistry().catch((err) => {
                log.error(err);
            });
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
        await this.httpClient.delete(`${this.baseURL}/${this.identifier}`)
            .expect(200)
            .send();
    }





    /**
     * set the port of the registry server
     *
     * @param      {number}  port    port of the server
     */
    setPort(port) {
        this.port = port;
    }




    /**
     * register service
     *
     * @param      {Object}   arg1              options
     * @param      {string}   arg1.identifier   the unique identifier for this service instance
     * @param      {number}   arg1.port         the port this service is listening on
     * @param      {string}   arg1.protocol     the protocol this service provides services through
     * @param      {string}   arg1.serviceName  the name of this service
     * @return     {Promise}  undefined
     */
    async register({
        identifier = uuid.v4(),
        port,
        protocol = 'http://',
        serviceName,
    }) {
        if (this.isDeregistered) {
            throw new Error('Cannot register service, it was de-registered and cannot be registered anymore!');
        }

        // eslint-disable-next-line no-param-reassign
        port = port || this.port;

        if (!port) {
            throw new Error('Cannot register service: the option.port parameter was not passed to the register method!');
        } else if (!serviceName) {
            throw new Error('Cannot register service: the option.serviceName parameter was not passed to the register method!');
        }


        // store the identifier, it is used for de-registering later on
        this.identifier = identifier;


        // get network interfaces, use the first ipv4
        // and the first ipv6 interfaces that are not
        // private or internal
        const addresses = this.getPublicNetworkInterfaces();

        // report the available heap size to the registry, it is used
        // to distribute the load on compute clients
        const stats = v8.getHeapStatistics();


        const response = await this.httpClient.post(this.baseURL)
            .expect(201)
            .send({
                availableMemory: stats.total_available_size,
                identifier,
                ipv4address: addresses.ipv4 ? `${protocol}${addresses.ipv4}:${port}` : null,
                ipv6address: addresses.ipv6 ? `${protocol}${addresses.ipv6}:${port}` : null,
                machineId: this.machineId,
                serviceType: serviceName,
            });

        const data = await response.getData();

        // the registry tells us how often we need to
        // update our records (convert from sec to msec)
        this.ttl = data.ttl * 1000;


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
        timeout = 10000,
    } = {}) {
        const response = await this.httpClient.get(this.baseURL)
            .timeout(timeout)
            .expect(200)
            .query({
                serviceType: serviceName,
            })
            .send();


        const addresses = await response.getData();

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
